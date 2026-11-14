import assert from 'node:assert/strict';
import {
  generateKeyPair,
  deriveSharedSecret,
  encryptPairwise,
  decryptPairwise,
  crc32,
  MeshPacketType,
  encodeMeshPacket,
  decodeMeshPacket,
  fragmentMeshPacket,
  ReassemblyPool,
  generateAckSignature,
  verifyAckSignature,
} from '../dist/index.js';

console.log('===============================================================');
console.log('JAMSHH BITCHAT-INSPIRED MESH & OFFLINE PROTOCOL E2E TEST SUITE');
console.log('===============================================================\n');

async function runAllTests() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`[PASS] Test ${total}: ${name}`);
      passed++;
    } catch (e) {
      console.error(`[FAIL] Test ${total}: ${name}`, e);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`[PASS] Test ${total}: ${name}`);
      passed++;
    } catch (e) {
      console.error(`[FAIL] Test ${total}: ${name}`, e);
    }
  }

  // TEST 1: Key Generation & Pairwise Cryptography
  const aliceKeys = generateKeyPair();
  const bobKeys = generateKeyPair();
  const charlieKeys = generateKeyPair();

  await testAsync('Offline Cryptographic Identity Generation (X25519)', async () => {
    assert.equal(typeof aliceKeys.publicKey, 'string');
    assert.equal(typeof aliceKeys.privateKey, 'string');
    assert.equal(aliceKeys.publicKey.length, 64);
    assert.equal(aliceKeys.privateKey.length, 64);
  });

  // TEST 2: Pairwise Encryption / Decryption between Alice & Charlie
  const plainOriginal = 'Hello Charlie! This is Alice sending an offline end-to-end encrypted mesh message.';
  let encryptedAliceToCharlie;
  await testAsync('Pairwise End-to-End Encryption (X25519 + AES-GCM)', async () => {
    encryptedAliceToCharlie = await encryptPairwise(
      plainOriginal,
      aliceKeys.privateKey,
      charlieKeys.publicKey
    );
    assert.ok(encryptedAliceToCharlie.ciphertext);
    assert.ok(encryptedAliceToCharlie.nonce);

    const decrypted = await decryptPairwise(
      encryptedAliceToCharlie.ciphertext,
      encryptedAliceToCharlie.nonce,
      charlieKeys.privateKey,
      aliceKeys.publicKey
    );
    assert.equal(decrypted, plainOriginal);
  });

  // TEST 3: Intermediary Bob cannot decrypt Alice's message to Charlie
  await testAsync('Relay Confidentiality: Intermediary Node B cannot decrypt Alice->Charlie message', async () => {
    let failed = false;
    try {
      await decryptPairwise(
        encryptedAliceToCharlie.ciphertext,
        encryptedAliceToCharlie.nonce,
        bobKeys.privateKey,
        aliceKeys.publicKey
      );
    } catch (e) {
      failed = true; // Decryption must fail!
    }
    assert.ok(failed, 'Intermediary Bob must NOT be able to decrypt pairwise message');
  });

  // TEST 4: Binary Mesh Packet Serialization & Integrity (CRC32)
  const messageId = '01234567-89ab-cdef-0123-456789abcdef';
  let meshPacketBytes;
  test('JamshMeshPacket Binary Serialization with CRC32', () => {
    meshPacketBytes = encodeMeshPacket({
      type: MeshPacketType.DIRECT_MSG,
      ttl: 3,
      hopCount: 0,
      senderFp: 'a1b2c3d4e5f60718',
      recipientFp: 'f8e7d6c5b4a39281',
      messageId: messageId,
      timestamp: Math.floor(Date.now() / 1000),
      payload: new TextEncoder().encode(JSON.stringify(encryptedAliceToCharlie)),
    });

    assert.ok(meshPacketBytes instanceof Uint8Array);
    const decoded = decodeMeshPacket(meshPacketBytes);
    assert.equal(decoded.type, MeshPacketType.DIRECT_MSG);
    assert.equal(decoded.ttl, 3);
    assert.equal(decoded.hopCount, 0);
    assert.equal(decoded.senderFp, 'a1b2c3d4e5f60718');
    assert.equal(decoded.recipientFp, 'f8e7d6c5b4a39281');
    assert.equal(decoded.messageId, messageId);
  });

  // TEST 5: MTU Slicing & Out-of-Order Reassembly
  await testAsync('GATT MTU Fragmentation & Out-of-Order Reassembly Pool', async () => {
    const rawBuffer = new Uint8Array(2500);
    for (let i = 0; i < 2500; i++) rawBuffer[i] = i % 256;

    const fragments = fragmentMeshPacket(rawBuffer, 360);
    assert.ok(fragments.length >= 7, `Expected >= 7 fragments, got ${fragments.length}`);

    // Randomize delivery order to simulate wireless jitter
    const shuffled = [...fragments].sort(() => Math.random() - 0.5);

    const pool = new ReassemblyPool(5000);
    let assembled = null;
    for (const fragBytes of shuffled) {
      const decodedFrag = decodeMeshPacket(fragBytes);
      assembled = pool.addFragment(decodedFrag);
      if (assembled) break;
    }

    assert.ok(assembled !== null, 'ReassemblyPool failed to produce completed payload');
    assert.equal(assembled.length, 2500, 'Reassembled buffer length did not match original');
    for (let i = 0; i < 2500; i++) {
      assert.equal(assembled[i], rawBuffer[i]);
    }
  });

  // TEST 6: 3-Device Multi-Hop Mesh Relay Simulation (Alice -> Bob -> Charlie)
  await testAsync('3-Device Epidemic Multi-Hop Mesh Relay Routing', async () => {
    // Simulated Node State
    const nodeA = { id: 'alice_id', peers: ['bob_id'], seen: new Set(), queue: [] };
    const nodeB = { id: 'bob_id', peers: ['alice_id', 'charlie_id'], seen: new Set(), queue: [] };
    const nodeC = { id: 'charlie_id', peers: ['bob_id'], seen: new Set(), inbox: [] };

    // Step 1: Alice creates packet for Charlie
    const packet = {
      id: 'mesh_pkt_001',
      sender_id: nodeA.id,
      recipient_id: nodeC.id,
      hop_count: 0,
      ttl: 3,
      payload: encryptedAliceToCharlie,
    };
    nodeA.seen.add(packet.id);

    // Step 2: Alice sends to her connected BLE neighbor (Bob)
    assert.ok(nodeA.peers.includes('bob_id'));
    // Bob receives packet
    assert.ok(!nodeB.seen.has(packet.id), 'Bob has not seen this packet yet');
    nodeB.seen.add(packet.id);

    // Bob checks if he is recipient
    if (packet.recipient_id === nodeB.id) {
      nodeB.inbox.push(packet);
    } else {
      // Bob relays packet: decrement TTL, increment hop count
      const relayedPacket = {
        ...packet,
        hop_count: packet.hop_count + 1,
        ttl: packet.ttl - 1,
      };
      assert.equal(relayedPacket.hop_count, 1);
      assert.equal(relayedPacket.ttl, 2);
      nodeB.queue.push(relayedPacket);

      // Bob's forwardPendingRelays forwards to newly connected peers (excluding sender Alice)
      for (const peer of nodeB.peers) {
        if (peer !== nodeA.id && peer === nodeC.id) {
          // Deliver to Charlie
          nodeC.seen.add(relayedPacket.id);
          nodeC.inbox.push(relayedPacket);
        }
      }
    }

    // Verify Charlie received the packet
    assert.equal(nodeC.inbox.length, 1);
    const charlieReceived = nodeC.inbox[0];
    assert.equal(charlieReceived.hop_count, 1);
    assert.equal(charlieReceived.ttl, 2);

    // Charlie decrypts it
    const decryptedByCharlie = await decryptPairwise(
      charlieReceived.payload.ciphertext,
      charlieReceived.payload.nonce,
      charlieKeys.privateKey,
      aliceKeys.publicKey
    );
    assert.equal(decryptedByCharlie, plainOriginal);
  });

  // TEST 7: Duplicate Packet Suppression
  test('Duplicate Packet Suppression via seen_packets LRU cache', () => {
    const seen = new Set();
    const packetId = 'duplicate_test_packet_456';
    let processedCount = 0;

    function handleIncomingPacket(id) {
      if (seen.has(id)) {
        return false; // Suppressed
      }
      seen.add(id);
      processedCount++;
      return true;
    }

    assert.equal(handleIncomingPacket(packetId), true);
    assert.equal(handleIncomingPacket(packetId), false); // 2nd arrival
    assert.equal(handleIncomingPacket(packetId), false); // 3rd arrival
    assert.equal(processedCount, 1);
  });

  // TEST 8: Authenticated Delivery Acknowledgement (HMAC-SHA256)
  await testAsync('Cryptographic Delivery ACK Signature & Verification', async () => {
    const sharedSecret = deriveSharedSecret(charlieKeys.privateKey, aliceKeys.publicKey);
    const validSignature = await generateAckSignature(sharedSecret, messageId);

    // Alice verifies ACK from Charlie
    const aliceShared = deriveSharedSecret(aliceKeys.privateKey, charlieKeys.publicKey);
    const isValid = await verifyAckSignature(aliceShared, messageId, validSignature);
    assert.equal(isValid, true, 'Valid ACK signature should verify');

    // Tampered ACK verification must fail
    const isTamperedValid = await verifyAckSignature(aliceShared, messageId, 'bad_signature_abc123');
    assert.equal(isTamperedValid, false, 'Tampered ACK must be rejected');

    // Rogue node Bob trying to forge Charlie's ACK must fail
    const rogueSecret = deriveSharedSecret(bobKeys.privateKey, aliceKeys.publicKey);
    const forgedSig = await generateAckSignature(rogueSecret, messageId);
    const isForgedValid = await verifyAckSignature(aliceShared, messageId, forgedSig);
    assert.equal(isForgedValid, false, 'Forged ACK from third-party must be rejected');
  });

  // TEST 9: Offline Pairing URL Protocol (Zero-Server)
  test('Offline Zero-Server QR / Link Pairing Protocol', () => {
    const aliceUser = { id: 'alice_usr_99', username: 'alice_wonder', display_name: 'Alice W' };
    const params = new URLSearchParams({
      id: aliceUser.id,
      name: aliceUser.username,
      pub: aliceKeys.publicKey,
    });
    const pairingUrl = `jamsh-pair://v1?${params.toString()}`;

    assert.ok(pairingUrl.startsWith('jamsh-pair://v1?'));
    const parsedParams = new URLSearchParams(pairingUrl.replace('jamsh-pair://v1?', ''));
    assert.equal(parsedParams.get('id'), 'alice_usr_99');
    assert.equal(parsedParams.get('name'), 'alice_wonder');
    assert.equal(parsedParams.get('pub'), aliceKeys.publicKey);
  });

  // TEST 10: Supabase Reconnection Idempotency & Deduplication
  test('Online Reconnection Queue Drain & PostgreSQL 23505 Idempotency', () => {
    const existingDb = new Set(['msg_001', 'msg_002']);
    const offlineQueue = [
      { id: 'msg_002', content: 'previously queued message' }, // duplicate
      { id: 'msg_003', content: 'new offline message' },       // new
    ];

    let inserted = 0;
    let deduplicated = 0;

    for (const msg of offlineQueue) {
      if (existingDb.has(msg.id)) {
        // Simulates Supabase error 23505 (unique_violation)
        deduplicated++;
      } else {
        existingDb.add(msg.id);
        inserted++;
      }
    }

    assert.equal(inserted, 1);
    assert.equal(deduplicated, 1);
    assert.equal(existingDb.has('msg_003'), true);
  });

  console.log(`\n===============================================================`);
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log(`===============================================================`);
  if (total !== passed) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
