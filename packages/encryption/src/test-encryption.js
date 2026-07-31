const assert = require('assert');
const { generateKeyPair, deriveSharedSecret, deriveAESKey, encryptWithKey, decryptWithKey } = require('../dist/index.js');

async function runTests() {
  console.log('⚡ Starting JAMSH Encryption Suite Tests...');

  // 1. Generate keys for User A & User B
  console.log('   - Generating X25519 device key pairs for Alice & Bob...');
  const aliceKeys = generateKeyPair();
  const bobKeys = generateKeyPair();
  
  assert.ok(aliceKeys.privateKey, 'Alice private key missing');
  assert.ok(aliceKeys.publicKey, 'Alice public key missing');
  assert.ok(bobKeys.privateKey, 'Bob private key missing');
  assert.ok(bobKeys.publicKey, 'Bob public key missing');
  
  console.log(`     Alice Public Key: ${aliceKeys.publicKey.substring(0, 24)}...`);
  console.log(`     Bob Public Key:   ${bobKeys.publicKey.substring(0, 24)}...`);

  // 2. Perform DH Exchange to derive shared secrets
  console.log('   - Performing X25519 Diffie-Hellman secret derivation...');
  const aliceSecret = deriveSharedSecret(aliceKeys.privateKey, bobKeys.publicKey);
  const bobSecret = deriveSharedSecret(bobKeys.privateKey, aliceKeys.publicKey);

  assert.strictEqual(aliceSecret, bobSecret, 'DH shared secrets do not match');
  console.log('     ✓ Pairwise Diffie-Hellman secret successfully established.');

  // 3. Derive AES Keys
  console.log('   - Deriving 256-bit AES-GCM session keys...');
  const aliceAESKey = await deriveAESKey(aliceSecret);
  const bobAESKey = await deriveAESKey(bobSecret);
  
  assert.ok(aliceAESKey, 'Alice AES key derivation failed');
  assert.ok(bobAESKey, 'Bob AES key derivation failed');
  console.log('     ✓ HKDF-SHA256 session key generated.');

  // 4. Encrypt and Decrypt Message
  const plaintext = '⚡ JAMSH: E2E Encrypted Lightning Strike! ⚡';
  console.log(`   - Encrypting message: "${plaintext}"`);
  
  const { ciphertext, nonce } = await encryptWithKey(plaintext, aliceAESKey);
  console.log(`     Ciphertext (Base64): ${ciphertext}`);
  console.log(`     Nonce (Base64):      ${nonce}`);

  console.log('   - Decrypting message locally using recipient session key...');
  const decrypted = await decryptWithKey(ciphertext, nonce, bobAESKey);
  
  assert.strictEqual(decrypted, plaintext, 'Decrypted text does not match original plaintext');
  console.log('     ✓ Message decrypted successfully. Integrity verified.');

  console.log('🎉 JAMSH Encryption Tests Passed Successfully!');
}

runTests().catch(err => {
  console.error('❌ Encryption Tests Failed:', err);
  process.exit(1);
});
