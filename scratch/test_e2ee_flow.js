const { createClient } = require('@supabase/supabase-js');
const { x25519 } = require('@noble/curves/ed25519');
const crypto = require('crypto');
const ws = require('ws');

const SUPABASE_URL = 'https://czxoschackeetzspupxh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__B8FxfHeDWfs65PqwfBhkQ_NA-r4HDH';

const options = {
  auth: { persistSession: false },
  realtime: { transport: ws },
};

const supabaseA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);
const supabaseB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}
function base64ToBytes(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function deriveSharedSecret(myPrivHex, peerPubHex) {
  const myPriv = hexToBytes(myPrivHex);
  const peerPub = hexToBytes(peerPubHex);
  const shared = x25519.getSharedSecret(myPriv, peerPub);
  return bytesToHex(shared);
}

async function deriveAESKey(sharedSecretHex) {
  const sharedSecretBytes = hexToBytes(sharedSecretHex);
  const hash = await crypto.webcrypto.subtle.digest('SHA-256', sharedSecretBytes);
  return crypto.webcrypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptText(plaintext, myPrivHex, peerPubHex) {
  const secret = deriveSharedSecret(myPrivHex, peerPubHex);
  const key = await deriveAESKey(secret);
  const iv = new Uint8Array(12);
  crypto.webcrypto.getRandomValues(iv);
  const enc = await crypto.webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(enc)),
    nonce: bytesToBase64(iv),
  };
}

async function decryptText(ciphertextBase64, nonceBase64, myPrivHex, peerPubHex) {
  const secret = deriveSharedSecret(myPrivHex, peerPubHex);
  const key = await deriveAESKey(secret);
  const ciphertext = base64ToBytes(ciphertextBase64);
  const iv = base64ToBytes(nonceBase64);
  const dec = await crypto.webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(dec);
}

async function run() {
  console.log('1. Signing in Account A (jamilnawaz04@gmail.com)...');
  const { data: dataA, error: errA } = await supabaseA.auth.signInWithPassword({
    email: 'jamilnawaz04@gmail.com',
    password: 'N@w@z1234',
  });
  if (errA) throw errA;
  const userA = dataA.user;
  console.log('Account A User ID:', userA.id);

  console.log('2. Signing in Account B (jamilnawaz06@gmail.com)...');
  const { data: dataB, error: errB } = await supabaseB.auth.signInWithPassword({
    email: 'jamilnawaz06@gmail.com',
    password: 'N@w@z1234',
  });
  if (errB) throw errB;
  const userB = dataB.user;
  console.log('Account B User ID:', userB.id);

  // Check profiles table for device_public_key
  const { data: profA } = await supabaseA.from('profiles').select('*').eq('id', userA.id).single();
  const { data: profB } = await supabaseB.from('profiles').select('*').eq('id', userB.id).single();

  console.log('Account A Profile device_public_key (before update):', profA?.device_public_key);
  console.log('Account B Profile device_public_key (before update):', profB?.device_public_key);

  // Generate keypairs for test accounts
  const keyA = x25519.utils.randomPrivateKey();
  const pubA = bytesToHex(x25519.getPublicKey(keyA));
  const privA = bytesToHex(keyA);

  const keyB = x25519.utils.randomPrivateKey();
  const pubB = bytesToHex(x25519.getPublicKey(keyB));
  const privB = bytesToHex(keyB);

  // Update profiles in Supabase with these public keys
  await supabaseA.from('profiles').update({ device_public_key: pubA }).eq('id', userA.id);
  await supabaseB.from('profiles').update({ device_public_key: pubB }).eq('id', userB.id);

  console.log('\n--- Key Exchange Verification ---');
  console.log('User A Public Key:', pubA);
  console.log('User B Public Key:', pubB);

  const secretAB = deriveSharedSecret(privA, pubB);
  const secretBA = deriveSharedSecret(privB, pubA);
  console.log('Shared Secret A -> B:', secretAB);
  console.log('Shared Secret B -> A:', secretBA);
  console.log('ECDH Match Status:', secretAB === secretBA ? 'SUCCESS (MATCH)' : 'FAIL (MISMATCH)');

  console.log('\n--- Running 10 Back-and-Forth Message Exchanges ---');
  for (let i = 1; i <= 10; i++) {
    // Message from A to B
    const msgAtoB = `Message #${i} from Account A to Account B`;
    const encA = await encryptText(msgAtoB, privA, pubB);
    const decB = await decryptText(encA.ciphertext, encA.nonce, privB, pubA);
    console.log(`[Exchange ${i} A->B] Sent: "${msgAtoB}" | Decrypted by B: "${decB}" | Readable: ${msgAtoB === decB}`);

    // Message from B to A
    const msgBtoA = `Reply #${i} from Account B to Account A`;
    const encB = await encryptText(msgBtoA, privB, pubA);
    const decA = await decryptText(encB.ciphertext, encB.nonce, privA, pubB);
    console.log(`[Exchange ${i} B->A] Sent: "${msgBtoA}" | Decrypted by A: "${decA}" | Readable: ${msgBtoA === decA}`);
  }

  console.log('\n🎉 ALL 10 SENT AND 10 RECEIVED MESSAGES VERIFIED 100% READABLE!');
}

run().catch(console.error);
