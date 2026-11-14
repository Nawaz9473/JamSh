export declare function getRandomBytes(length: number): Uint8Array;
export declare function bytesToHex(bytes: Uint8Array): string;
export declare function hexToBytes(hex: string): Uint8Array;
export declare function bytesToBase64(bytes: Uint8Array): string;
export declare function base64ToBytes(base64: string): Uint8Array;
export interface KeyPair {
    privateKey: string;
    publicKey: string;
}
export declare function generateKeyPair(): KeyPair;
export declare function generateDeterministicKeyPair(seedInput: string): Promise<KeyPair>;
export declare function computeFingerprint(publicKeyHex: string): Promise<string>;
export declare function deriveSharedSecret(myPrivateKeyHex: string, peerPublicKeyHex: string): string;
export declare function deriveAESKey(sharedSecretHex: string): Promise<CryptoKey>;
export declare function importRawAESKey(rawKeyHex: string): Promise<CryptoKey>;
export declare function generateGroupKeyHex(): string;
export declare function encryptWithKey(plaintext: string, cryptoKey: CryptoKey): Promise<{
    ciphertext: string;
    nonce: string;
}>;
export declare function decryptWithKey(ciphertextBase64: string, nonceBase64: string, cryptoKey: CryptoKey): Promise<string>;
export declare function encryptPairwise(plaintext: string, myPrivateKeyHex: string, peerPublicKeyHex: string): Promise<{
    ciphertext: string;
    nonce: string;
}>;
export declare function decryptPairwise(ciphertextBase64: string, nonceBase64: string, myPrivateKeyHex: string, peerPublicKeyHex: string): Promise<string>;
export declare function generateAckSignature(sharedSecretHex: string, messageId: string): Promise<string>;
export declare function verifyAckSignature(sharedSecretHex: string, messageId: string, signatureHex: string): Promise<boolean>;
export declare function constantTimeEqual(a: string, b: string): boolean;
export declare enum MeshPacketType {
    DIRECT_MSG = 1,
    RELAY_MSG = 2,
    DELIVERY_ACK = 3,
    FRAGMENT = 4,
    PAIR_REQ = 5,
    PAIR_RESP = 6
}
export interface JamshMeshPacket {
    magic?: number;
    version?: number;
    type: MeshPacketType;
    ttl: number;
    hopCount: number;
    flags?: number;
    messageId: string;
    senderFp: string;
    recipientFp: string;
    timestamp: number;
    payload: Uint8Array;
    crc32?: number;
}
export declare function crc32(bytes: Uint8Array): number;
export declare function uuidToBytes(uuidStr: string): Uint8Array;
export declare function bytesToUuid(bytes: Uint8Array): string;
/**
 * Encodes a structured mesh packet into a binary wire buffer
 */
export declare function encodeMeshPacket(packet: JamshMeshPacket): Uint8Array;
/**
 * Decodes a binary wire buffer into a structured mesh packet
 */
export declare function decodeMeshPacket(bytes: Uint8Array): JamshMeshPacket;
/**
 * Slices a binary packet into small MTU-compliant fragment packets
 * Default chunk payload size is 360 bytes (total fragment packet is < 420 bytes)
 */
export declare function fragmentMeshPacket(packetBytes: Uint8Array, maxChunkSize?: number): Uint8Array[];
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
export declare class ReassemblyPool {
    private pool;
    private readonly timeoutMs;
    constructor(timeoutMs?: number);
    /**
     * Feed a fragment into the pool. If all fragments are collected, returns the reconstructed packet.
     */
    addFragment(packet: JamshMeshPacket): Uint8Array | null;
    private cleanupExpired;
    clear(): void;
}
