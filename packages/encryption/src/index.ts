import { x25519 } from '@noble/curves/ed25519';

// Cryptographic RNG helper ensuring strong randomness across Web, Node, and React Native
function getCrypto(): any {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  if (typeof window !== 'undefined' && (window.crypto || (window as any).msCrypto)) {
    return window.crypto || (window as any).msCrypto;
  }
  if (typeof require !== 'undefined') {
    try {
      const nodeCrypto = require('crypto');
      return nodeCrypto.webcrypto || nodeCrypto;
    } catch (e) {}
  }
  throw new Error('Cryptographically secure PRNG not available.');
}

export function getRandomBytes(length: number): Uint8Array {
  const cryptoObj = getCrypto();
  const bytes = new Uint8Array(length);
  if (cryptoObj.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }
  if (cryptoObj.randomBytes) {
    const buf = cryptoObj.randomBytes(length);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  throw new Error('Secure random generator missing in current environment.');
}

// Helper utilities for byte conversions
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa !== 'undefined') {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob !== 'undefined') {
    const binString = atob(base64);
    return Uint8Array.from(binString, (m) => m.charCodeAt(0));
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

// Generate an X25519 Key Pair
export interface KeyPair {
  privateKey: string; // Hex encoded (64 chars)
  publicKey: string;  // Hex encoded (64 chars)
}

export function generateKeyPair(): KeyPair {
  const privBytes = getRandomBytes(32);
  // Noble curves random private key or custom clamp
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}

export async function generateDeterministicKeyPair(seedInput: string): Promise<KeyPair> {
  const cryptoObj = getCrypto();
  const encoder = new TextEncoder();
  let seedBytes: Uint8Array;
  if (cryptoObj.subtle) {
    const hash = await cryptoObj.subtle.digest('SHA-256', encoder.encode(seedInput));
    seedBytes = new Uint8Array(hash);
  } else if (cryptoObj.createHash) {
    const hash = cryptoObj.createHash('sha256').update(seedInput).digest();
    seedBytes = new Uint8Array(hash);
  } else {
    throw new Error('SHA-256 required for deterministic key pair.');
  }

  const publicKey = x25519.getPublicKey(seedBytes);
  return {
    privateKey: bytesToHex(seedBytes),
    publicKey: bytesToHex(publicKey),
  };
}

// Compute truncated 8-byte (16 hex char) fingerprint from public key
export async function computeFingerprint(publicKeyHex: string): Promise<string> {
  const cryptoObj = getCrypto();
  const pubBytes = hexToBytes(publicKeyHex);
  let hashBytes: Uint8Array;
  if (cryptoObj.subtle) {
    const digest = await cryptoObj.subtle.digest('SHA-256', pubBytes);
    hashBytes = new Uint8Array(digest);
  } else if (cryptoObj.createHash) {
    const digest = cryptoObj.createHash('sha256').update(pubBytes).digest();
    hashBytes = new Uint8Array(digest);
  } else {
    // Simple FNV fallback only if subtle digest unavailable
    let h = 0x811c9dc5;
    for (let i = 0; i < pubBytes.length; i++) {
      h ^= pubBytes[i];
      h = Math.imul(h, 0x01000193);
    }
    return Math.abs(h).toString(16).padStart(16, '0');
  }
  return bytesToHex(hashBytes.slice(0, 8));
}

// Derive a shared secret from our private key and the peer's public key
export function deriveSharedSecret(myPrivateKeyHex: string, peerPublicKeyHex: string): string {
  const myPrivateKey = hexToBytes(myPrivateKeyHex);
  const peerPublicKey = hexToBytes(peerPublicKeyHex);
  const shared = x25519.getSharedSecret(myPrivateKey, peerPublicKey);
  return bytesToHex(shared);
}

// HKDF-like key derivation using Web Crypto SHA-256 digest
export async function deriveAESKey(sharedSecretHex: string): Promise<CryptoKey> {
  const sharedSecretBytes = hexToBytes(sharedSecretHex);
  const cryptoObj = getCrypto();

  if (!cryptoObj.subtle) {
    throw new Error('Web Crypto subtle API not available for AES-GCM.');
  }

  const hash = await cryptoObj.subtle.digest('SHA-256', sharedSecretBytes);
  return cryptoObj.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Import a raw hex key as a CryptoKey
export async function importRawAESKey(rawKeyHex: string): Promise<CryptoKey> {
  const rawKeyBytes = hexToBytes(rawKeyHex);
  const cryptoObj = getCrypto();
  return cryptoObj.subtle.importKey(
    'raw',
    rawKeyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Generate a random 256-bit AES-GCM key in hex format (e.g. for group chats)
export function generateGroupKeyHex(): string {
  const bytes = getRandomBytes(32);
  return bytesToHex(bytes);
}

// Encrypt plaintext using a derived CryptoKey
export async function encryptWithKey(plaintext: string, cryptoKey: CryptoKey): Promise<{ ciphertext: string; nonce: string }> {
  const cryptoObj = getCrypto();
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Generate cryptographically secure 12-byte IV for AES-GCM
  const iv = getRandomBytes(12);

  const encrypted = await cryptoObj.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    nonce: bytesToBase64(iv),
  };
}

// Decrypt ciphertext using a derived CryptoKey
export async function decryptWithKey(ciphertextBase64: string, nonceBase64: string, cryptoKey: CryptoKey): Promise<string> {
  const cryptoObj = getCrypto();
  const ciphertext = base64ToBytes(ciphertextBase64);
  const iv = base64ToBytes(nonceBase64);

  const decrypted = await cryptoObj.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Convenient pairwise encryption
export async function encryptPairwise(plaintext: string, myPrivateKeyHex: string, peerPublicKeyHex: string): Promise<{ ciphertext: string; nonce: string }> {
  const secret = deriveSharedSecret(myPrivateKeyHex, peerPublicKeyHex);
  const key = await deriveAESKey(secret);
  return encryptWithKey(plaintext, key);
}

// Convenient pairwise decryption
export async function decryptPairwise(ciphertextBase64: string, nonceBase64: string, myPrivateKeyHex: string, peerPublicKeyHex: string): Promise<string> {
  const secret = deriveSharedSecret(myPrivateKeyHex, peerPublicKeyHex);
  const key = await deriveAESKey(secret);
  return decryptWithKey(ciphertextBase64, nonceBase64, key);
}

// Purpose-separated HMAC-SHA256 Delivery ACK Generation and Verification
export async function generateAckSignature(sharedSecretHex: string, messageId: string): Promise<string> {
  const cryptoObj = getCrypto();
  const secretBytes = hexToBytes(sharedSecretHex);
  const encoder = new TextEncoder();

  // 1. Derive Ack Key
  const ackKeyBytes = await hmacRaw(secretBytes, encoder.encode('jamsh-mesh-ack'));
  // 2. Sign canonical context: [messageId]:SUCCESS
  const sigBytes = await hmacRaw(ackKeyBytes, encoder.encode(`${messageId}:SUCCESS`));
  return bytesToHex(sigBytes);
}

export async function verifyAckSignature(sharedSecretHex: string, messageId: string, signatureHex: string): Promise<boolean> {
  try {
    const expectedSig = await generateAckSignature(sharedSecretHex, messageId);
    return constantTimeEqual(expectedSig, signatureHex);
  } catch (e) {
    return false;
  }
}

async function hmacRaw(keyBytes: Uint8Array, dataBytes: Uint8Array): Promise<Uint8Array> {
  const cryptoObj = getCrypto();
  if (cryptoObj.subtle) {
    const key = await cryptoObj.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await cryptoObj.subtle.sign('HMAC', key, dataBytes);
    return new Uint8Array(sig);
  }
  if (cryptoObj.createHmac) {
    const hmac = cryptoObj.createHmac('sha256', Buffer.from(keyBytes)).update(Buffer.from(dataBytes)).digest();
    return new Uint8Array(hmac);
  }
  throw new Error('HMAC support missing.');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// =====================================================================
// BITCHAT-INSPIRED BINARY MESH PROTOCOL ENGINE
// =====================================================================

export enum MeshPacketType {
  DIRECT_MSG = 0x01,
  RELAY_MSG = 0x02,
  DELIVERY_ACK = 0x03,
  FRAGMENT = 0x04,
  PAIR_REQ = 0x05,
  PAIR_RESP = 0x06,
}

export interface JamshMeshPacket {
  magic?: number; // 0x4A ('J')
  version?: number; // 0x01
  type: MeshPacketType;
  ttl: number; // default 7
  hopCount: number; // default 0
  flags?: number; // default 0
  messageId: string; // 16 bytes (32 hex characters)
  senderFp: string; // 8 bytes (16 hex characters)
  recipientFp: string; // 8 bytes (16 hex characters)
  timestamp: number; // uint32 epoch seconds
  payload: Uint8Array;
  crc32?: number;
}

// Fast IEEE 802.3 CRC32 Implementation
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return ((crc ^ 0xFFFFFFFF) >>> 0);
}

// Convert UUID string (e.g. '3fa85f64-5717-4562-b3fc-2c963f66afa6') to 16 bytes
export function uuidToBytes(uuidStr: string): Uint8Array {
  const clean = uuidStr.replace(/-/g, '').padStart(32, '0').slice(0, 32);
  return hexToBytes(clean);
}

export function bytesToUuid(bytes: Uint8Array): string {
  const hex = bytesToHex(bytes.slice(0, 16)).padStart(32, '0');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}

/**
 * Encodes a structured mesh packet into a binary wire buffer
 */
export function encodeMeshPacket(packet: JamshMeshPacket): Uint8Array {
  const magic = packet.magic ?? 0x4A;
  const version = packet.version ?? 0x01;
  const ttl = Math.max(0, Math.min(255, packet.ttl));
  const hopCount = Math.max(0, Math.min(255, packet.hopCount));
  const flags = packet.flags ?? 0;
  const payloadLen = packet.payload.length;

  const msgIdBytes = packet.messageId.includes('-')
    ? uuidToBytes(packet.messageId)
    : hexToBytes(packet.messageId.padEnd(32, '0').slice(0, 32));

  const senderFpBytes = hexToBytes(packet.senderFp.padEnd(16, '0').slice(0, 16));
  const recipientFpBytes = hexToBytes(packet.recipientFp.padEnd(16, '0').slice(0, 16));

  const timestamp = packet.timestamp || Math.floor(Date.now() / 1000);

  // Header (44 bytes) + Payload (N bytes) + CRC32 (4 bytes) = 48 + N bytes
  const totalLength = 44 + payloadLen + 4;
  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer);

  buffer[0] = magic;
  buffer[1] = version;
  buffer[2] = packet.type;
  buffer[3] = ttl;
  buffer[4] = hopCount;
  buffer[5] = flags;
  view.setUint16(6, payloadLen, false); // Big-Endian

  buffer.set(msgIdBytes.slice(0, 16), 8);
  buffer.set(senderFpBytes.slice(0, 8), 24);
  buffer.set(recipientFpBytes.slice(0, 8), 32);
  view.setUint32(40, timestamp, false); // Big-Endian

  buffer.set(packet.payload, 44);

  // Compute CRC32 over the frame before checksum
  const checksum = crc32(buffer.subarray(0, 44 + payloadLen));
  view.setUint32(44 + payloadLen, checksum, false);

  return buffer;
}

/**
 * Decodes a binary wire buffer into a structured mesh packet
 */
export function decodeMeshPacket(bytes: Uint8Array): JamshMeshPacket {
  if (bytes.length < 48) {
    throw new Error(`Packet too small: ${bytes.length} bytes (min 48 required)`);
  }

  const magic = bytes[0];
  if (magic !== 0x4A) {
    throw new Error(`Invalid packet magic: 0x${magic.toString(16)} (expected 0x4A)`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[1];
  const type: MeshPacketType = bytes[2];
  const ttl = bytes[3];
  const hopCount = bytes[4];
  const flags = bytes[5];
  const payloadLen = view.getUint16(6, false);

  if (bytes.length < 44 + payloadLen + 4) {
    throw new Error(`Truncated packet: expected ${44 + payloadLen + 4} bytes, got ${bytes.length}`);
  }

  const msgIdBytes = bytes.subarray(8, 24);
  const senderFpBytes = bytes.subarray(24, 32);
  const recipientFpBytes = bytes.subarray(32, 40);
  const timestamp = view.getUint32(40, false);

  const payload = bytes.subarray(44, 44 + payloadLen);
  const expectedCrc = view.getUint32(44 + payloadLen, false);
  const actualCrc = crc32(bytes.subarray(0, 44 + payloadLen));

  if (expectedCrc !== actualCrc) {
    throw new Error(`CRC32 mismatch: expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)}`);
  }

  return {
    magic,
    version,
    type,
    ttl,
    hopCount,
    flags,
    messageId: bytesToUuid(msgIdBytes),
    senderFp: bytesToHex(senderFpBytes),
    recipientFp: bytesToHex(recipientFpBytes),
    timestamp,
    payload,
    crc32: actualCrc,
  };
}

/**
 * Slices a binary packet into small MTU-compliant fragment packets
 * Default chunk payload size is 360 bytes (total fragment packet is < 420 bytes)
 */
export function fragmentMeshPacket(packetBytes: Uint8Array, maxChunkSize = 360): Uint8Array[] {
  if (packetBytes.length <= maxChunkSize) {
    return [packetBytes];
  }

  const totalFragments = Math.ceil(packetBytes.length / maxChunkSize);
  const fragments: Uint8Array[] = [];

  // Generate a distinct fragment message ID to bind fragments together
  const fragmentMsgId = getRandomBytes(16);

  for (let i = 0; i < totalFragments; i++) {
    const chunkStart = i * maxChunkSize;
    const chunkEnd = Math.min(packetBytes.length, chunkStart + maxChunkSize);
    const chunkData = packetBytes.subarray(chunkStart, chunkEnd);

    // Fragment Payload: [Index (2)][Total (2)][Data (N)]
    const fragPayload = new Uint8Array(4 + chunkData.length);
    const v = new DataView(fragPayload.buffer);
    v.setUint16(0, i, false);
    v.setUint16(2, totalFragments, false);
    fragPayload.set(chunkData, 4);

    const fragPacket: JamshMeshPacket = {
      type: MeshPacketType.FRAGMENT,
      ttl: 7,
      hopCount: 0,
      messageId: bytesToUuid(fragmentMsgId),
      senderFp: '0000000000000000',
      recipientFp: '0000000000000000',
      timestamp: Math.floor(Date.now() / 1000),
      payload: fragPayload,
    };

    fragments.push(encodeMeshPacket(fragPacket));
  }

  return fragments;
}

/**
 * Reassembly Pool for fragmented mesh packets
 */
export interface PendingReassembly {
  messageId: string;
  totalFragments: number;
  receivedCount: number;
  fragments: Map<number, Uint8Array>;
  createdAt: number;
}

export class ReassemblyPool {
  private pool = new Map<string, PendingReassembly>();
  private readonly timeoutMs: number;

  constructor(timeoutMs = 30000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Feed a fragment into the pool. If all fragments are collected, returns the reconstructed packet.
   */
  public addFragment(packet: JamshMeshPacket): Uint8Array | null {
    if (packet.type !== MeshPacketType.FRAGMENT) {
      return null;
    }

    const payload = packet.payload;
    if (payload.length < 4) return null;

    const v = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const fragmentIndex = v.getUint16(0, false);
    const totalFragments = v.getUint16(2, false);
    const chunkData = payload.subarray(4);

    this.cleanupExpired();

    let entry = this.pool.get(packet.messageId);
    if (!entry) {
      entry = {
        messageId: packet.messageId,
        totalFragments,
        receivedCount: 0,
        fragments: new Map(),
        createdAt: Date.now(),
      };
      this.pool.set(packet.messageId, entry);
    }

    if (!entry.fragments.has(fragmentIndex)) {
      entry.fragments.set(fragmentIndex, chunkData);
      entry.receivedCount++;
    }

    if (entry.receivedCount === entry.totalFragments) {
      // Reassemble in order
      let totalLen = 0;
      for (let i = 0; i < entry.totalFragments; i++) {
        const c = entry.fragments.get(i);
        if (!c) return null; // Incomplete
        totalLen += c.length;
      }

      const reconstructed = new Uint8Array(totalLen);
      let offset = 0;
      for (let i = 0; i < entry.totalFragments; i++) {
        const c = entry.fragments.get(i)!;
        reconstructed.set(c, offset);
        offset += c.length;
      }

      this.pool.delete(packet.messageId);
      return reconstructed;
    }

    return null;
  }

  private cleanupExpired() {
    const now = Date.now();
    for (const [id, entry] of this.pool.entries()) {
      if (now - entry.createdAt > this.timeoutMs) {
        this.pool.delete(id);
      }
    }
  }

  public clear() {
    this.pool.clear();
  }
}
