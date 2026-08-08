const { initializeE2EKeys, sendEncryptedMessage, fetchMessages, decryptReceivedMessage, useAuthStore, supabase } = require('../packages/api/dist/index.js');

async function testE2EE() {
  console.log('1. Signing in User A (jamilnawaz04@gmail.com)...');
  const { data: dataA, error: errA } = await supabase.auth.signInWithPassword({
    email: 'jamilnawaz04@gmail.com',
    password: 'N@w@z1234',
  });
  if (errA) throw errA;
  const userA = dataA.user;
  console.log('   User A ID:', userA.id);

  // Initialize E2E keys for User A
  useAuthStore.getState().setUser(userA);
  const keysA = await initializeE2EKeys(userA.id, 'web-device-1');
  console.log('   User A Public Key:', keysA.publicKey);

  console.log('2. Signing in User B (jamilnawaz06@gmail.com)...');
  const { data: dataB, error: errB } = await supabase.auth.signInWithPassword({
    email: 'jamilnawaz06@gmail.com',
    password: 'N@w@z1234',
  });
  if (errB) throw errB;
  const userB = dataB.user;
  console.log('   User B ID:', userB.id);

  // Initialize E2E keys for User B
  useAuthStore.getState().setUser(userB);
  const keysB = await initializeE2EKeys(userB.id, 'web-device-1');
  console.log('   User B Public Key:', keysB.publicKey);

  // Find or create direct room between A and B
  useAuthStore.getState().setUser(userA);
  useAuthStore.getState().setDeviceKeyPair(keysA);

  let roomId = null;
  const { data: roomsA } = await supabase.from('chat_members').select('room_id').eq('user_id', userA.id);
  if (roomsA) {
    for (const r of roomsA) {
      const { data: peers } = await supabase.from('chat_members').select('user_id').eq('room_id', r.room_id);
      if (peers && peers.some(p => p.user_id === userB.id)) {
        roomId = r.room_id;
        break;
      }
    }
  }

  if (!roomId) {
    console.log('   Creating chat room between A and B...');
    const { data: newRoom } = await supabase.from('chat_rooms').insert({ type: 'direct' }).select().single();
    roomId = newRoom.id;
    await supabase.from('chat_members').insert([
      { room_id: roomId, user_id: userA.id },
      { room_id: roomId, user_id: userB.id }
    ]);
  }

  console.log('   Using Direct Room ID:', roomId);

  // 3. User A sends message to User B
  console.log('\n3. User A sending message to User B...');
  const testMsgA = 'Hello from User A - E2EE Decryption Verification ' + Date.now();
  const sentMsgA = await sendEncryptedMessage(roomId, userB.id, testMsgA);
  console.log('   Ciphertext stored in DB:', sentMsgA.content.substring(0, 30) + '...');
  console.log('   Nonce:', sentMsgA.nonce);

  // 4. User B reads messages and decrypts User A\'s message
  console.log('\n4. User B reading and decrypting User A\'s message...');
  useAuthStore.getState().setUser(userB);
  useAuthStore.getState().setDeviceKeyPair(keysB);

  const rawMsgs = await fetchMessages(roomId);
  const targetMsg = rawMsgs.find(m => m.id === sentMsgA.id);
  if (!targetMsg) throw new Error('Sent message not found in room messages!');

  const decryptedByB = await decryptReceivedMessage(targetMsg, userA.id);
  console.log('   Plaintext sent by A:     "', testMsgA, '"');
  console.log('   Decrypted by User B:     "', decryptedByB, '"');
  console.log('   Decryption Success Match:', testMsgA === decryptedByB);

  // 5. User B sends reply to User A
  console.log('\n5. User B sending reply to User A...');
  const replyMsgB = 'Reply from User B - E2EE Decryption Verification ' + Date.now();
  const sentReplyB = await sendEncryptedMessage(roomId, userA.id, replyMsgB);

  // 6. User A reads and decrypts User B\'s reply
  console.log('\n6. User A reading and decrypting User B\'s reply...');
  useAuthStore.getState().setUser(userA);
  useAuthStore.getState().setDeviceKeyPair(keysA);

  const rawMsgs2 = await fetchMessages(roomId);
  const targetReply = rawMsgs2.find(m => m.id === sentReplyB.id);
  const decryptedByA = await decryptReceivedMessage(targetReply, userB.id);

  console.log('   Plaintext sent by B:     "', replyMsgB, '"');
  console.log('   Decrypted by User A:     "', decryptedByA, '"');
  console.log('   Decryption Success Match:', replyMsgB === decryptedByA);

  if (testMsgA === decryptedByB && replyMsgB === decryptedByA) {
    console.log('\n🎉 ALL MESSAGES SUCCESSFULLY ENCRYPTED ON BACKEND AND DECRYPTED ON BOTH USER MESSAGE CARDS!');
  } else {
    console.error('\n❌ DECRYPTION MISMATCH DETECTED');
  }
}

testE2EE().catch(console.error);
