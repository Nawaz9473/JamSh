const { generateDeterministicKeyPair, encryptPairwise, decryptPairwise } = require('./packages/encryption/dist/index.js');

async function testE2EE() {
  const user1Id = 'user_1_uuid';
  const user2Id = 'user_2_uuid';

  const user1Keys = await generateDeterministicKeyPair(user1Id + '_jamsh_e2ee_master_seed_v1');
  const user2Keys = await generateDeterministicKeyPair(user2Id + '_jamsh_e2ee_master_seed_v1');

  console.log('User 1 Public Key:', user1Keys.publicKey);
  console.log('User 2 Public Key:', user2Keys.publicKey);

  const plaintext = 'Web message at timestamp 123456789';
  console.log('Original Plaintext:', plaintext);

  // User 1 encrypts message for User 2
  const enc = await encryptPairwise(plaintext, user1Keys.privateKey, user2Keys.publicKey);
  console.log('Encrypted Ciphertext:', enc.ciphertext);
  console.log('Nonce:', enc.nonce);

  // User 2 decrypts message from User 1
  const dec = await decryptPairwise(enc.ciphertext, enc.nonce, user2Keys.privateKey, user1Keys.publicKey);
  console.log('Decrypted Plaintext:', dec);

  if (dec === plaintext) {
    console.log('SUCCESS: Decrypted plaintext matches original!');
  } else {
    console.error('FAILURE: Decrypted plaintext does NOT match!');
  }
}

testE2EE().catch(console.error);
