import assert from 'assert';
import {
  generateKeyPair,
  deriveSharedSecret,
  computeFingerprint,
  encodeMeshPacket,
  decodeMeshPacket,
  fragmentMeshPacket,
  ReassemblyPool,
  generateAckSignature,
  verifyAckSignature,
  MeshPacketType,
  crc32,
  bytesToHex,
  hexToBytes
} from '../dist/index.js';

async function testMeshProtocolEngine() {
  console.log('⚡ [Test] Starting JamSh BLE Mesh Protocol Test Suite...');

  // 1. Keypairs & Fingerprints
  const alice = generateKeyPair();
  const bob = generateKeyPair();
  const aliceFp = await computeFingerprint(alice.publicKey);
  const bobFp = await computeFingerprint(bob.publicKey);

  assert.strictEqual(aliceFp.length, 16, 'Alice fingerprint must be 16 hex chars (8 bytes)');
  assert.strictEqual(bobFp.length, 16, 'Bob fingerprint must be 16 hex chars (8 bytes)');
  console.log(`  ✓ Fingerprints derived: Alice [${aliceFp}], Bob [${bobFp}]`);

  // 2. Binary Encoding & Decoding of Mesh Packet
  const samplePayload = new TextEncoder().encode('Hello JamSh BLE Mesh Network! Testing binary framing.');
  const msgId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

  const packet = {
    type: MeshPacketType.DIRECT_MSG,
    ttl: 7,
    hopCount: 0,
    messageId: msgId,
    senderFp: aliceFp,
    recipientFp: bobFp,
    timestamp: Math.floor(Date.now() / 1000),
    payload: samplePayload
  };

  const wireBytes = encodeMeshPacket(packet);
  assert.ok(wireBytes.length > 48, 'Encoded packet must be at least 48 bytes');
  console.log(`  ✓ Encoded packet wire size: ${wireBytes.length} bytes (overhead: 48 bytes)`);

  const decoded = decodeMeshPacket(wireBytes);
  assert.strictEqual(decoded.magic, 0x4A, 'Magic must be 0x4A');
  assert.strictEqual(decoded.version, 0x01, 'Version must be 0x01');
  assert.strictEqual(decoded.type, MeshPacketType.DIRECT_MSG, 'Type must be DIRECT_MSG');
  assert.strictEqual(decoded.ttl, 7, 'TTL must be 7');
  assert.strictEqual(decoded.hopCount, 0, 'Hop count must be 0');
  assert.strictEqual(decoded.messageId, msgId, 'Message ID must match');
  assert.strictEqual(decoded.senderFp, aliceFp, 'Sender fingerprint must match');
  assert.strictEqual(decoded.recipientFp, bobFp, 'Recipient fingerprint must match');
  assert.strictEqual(new TextDecoder().decode(decoded.payload), 'Hello JamSh BLE Mesh Network! Testing binary framing.');
  console.log('  ✓ Packet decode and CRC32 verification succeeded');

  // 3. Packet Fragmentation and Reassembly Test
  console.log('  - Testing MTU fragmentation & reassembly...');
  const largeData = new Uint8Array(1200);
  for (let i = 0; i < largeData.length; i++) largeData[i] = (i % 256);

  const largePacket = {
    type: MeshPacketType.RELAY_MSG,
    ttl: 7,
    hopCount: 0,
    messageId: '550e8400-e29b-41d4-a716-446655440000',
    senderFp: aliceFp,
    recipientFp: bobFp,
    timestamp: Math.floor(Date.now() / 1000),
    payload: largeData
  };

  const largeWire = encodeMeshPacket(largePacket);
  const fragments = fragmentMeshPacket(largeWire, 350);
  assert.ok(fragments.length > 1, 'Should split into multiple fragments');
  console.log(`    Total fragments created: ${fragments.length} (each <= 420 bytes)`);

  const pool = new ReassemblyPool();
  let reassembled = null;
  // Feed fragments in reverse order to verify order-independence
  for (let i = fragments.length - 1; i >= 0; i--) {
    const fragDecoded = decodeMeshPacket(fragments[i]);
    const res = pool.addFragment(fragDecoded);
    if (res) reassembled = res;
  }

  assert.ok(reassembled, 'Pool must reassemble all fragments');
  assert.strictEqual(reassembled.length, largeWire.length, 'Reassembled length must match original wire size');
  const reassembledDecoded = decodeMeshPacket(reassembled);
  assert.strictEqual(reassembledDecoded.messageId, '550e8400-e29b-41d4-a716-446655440000');
  assert.deepStrictEqual(reassembledDecoded.payload, largeData);
  console.log('  ✓ Multi-fragment out-of-order reassembly validated successfully');

  // 4. Authenticated Delivery ACK Handshake
  console.log('  - Testing purpose-separated ACK signature verification...');
  const sharedSecret = deriveSharedSecret(alice.privateKey, bob.publicKey);
  const testMsgId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

  const validSig = await generateAckSignature(sharedSecret, testMsgId);
  assert.strictEqual(validSig.length, 64, 'ACK signature must be 32 bytes (64 hex chars)');

  const isValid = await verifyAckSignature(sharedSecret, testMsgId, validSig);
  assert.strictEqual(isValid, true, 'Valid signature must verify');

  const isTamperedMsg = await verifyAckSignature(sharedSecret, 'wrong-msg-id-1234', validSig);
  assert.strictEqual(isTamperedMsg, false, 'Tampered message ID must fail verification');

  const isTamperedSig = await verifyAckSignature(sharedSecret, testMsgId, '00'.repeat(32));
  assert.strictEqual(isTamperedSig, false, 'Forged signature must fail verification');
  console.log('  ✓ Authenticated delivery ACK signature verification passed');

  console.log('\n🎉 ALL JAMSHH MESH PROTOCOL ENGINE TESTS PASSED (100%)');
}

testMeshProtocolEngine().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
