import { x25519 } from '@noble/curves/ed25519';
// Helper utilities for byte conversions
export function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
export function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}
export function bytesToBase64(bytes) {
    if (typeof btoa !== 'undefined') {
        return btoa(String.fromCharCode(...bytes));
    }
    // Node.js fallback
    return Buffer.from(bytes).toString('base64');
}
export function base64ToBytes(base64) {
    if (typeof atob !== 'undefined') {
        const binString = atob(base64);
        return Uint8Array.from(binString, (m) => m.charCodeAt(0));
    }
    // Node.js fallback
    return new Uint8Array(Buffer.from(base64, 'base64'));
}
export function generateKeyPair() {
    const privateKey = x25519.utils.randomPrivateKey();
    const publicKey = x25519.getPublicKey(privateKey);
    return {
        privateKey: bytesToHex(privateKey),
        publicKey: bytesToHex(publicKey),
    };
}
// Derive a shared secret from our private key and the peer's public key
export function deriveSharedSecret(myPrivateKeyHex, peerPublicKeyHex) {
    const myPrivateKey = hexToBytes(myPrivateKeyHex);
    const peerPublicKey = hexToBytes(peerPublicKeyHex);
    const shared = x25519.getSharedSecret(myPrivateKey, peerPublicKey);
    return bytesToHex(shared);
}
// HKDF-like key derivation using Web Crypto SHA-256 digest
// Derives a 256-bit AES key from a hex-encoded shared secret
export async function deriveAESKey(sharedSecretHex) {
    const sharedSecretBytes = hexToBytes(sharedSecretHex);
    let cryptoObj = typeof globalThis !== 'undefined' ? (globalThis.crypto || globalThis.msCrypto) : null;
    if (!cryptoObj && typeof require !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-var-packages
        cryptoObj = require('crypto').webcrypto;
    }
    if (!cryptoObj || !cryptoObj.subtle) {
        throw new Error('Web Crypto API not available. Ensure crypto is polyfilled in React Native.');
    }
    // Hash the shared secret to derive a uniform 256-bit key
    const hash = await cryptoObj.subtle.digest('SHA-256', sharedSecretBytes);
    return cryptoObj.subtle.importKey('raw', hash, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
// Import a raw hex key as a CryptoKey
export async function importRawAESKey(rawKeyHex) {
    const rawKeyBytes = hexToBytes(rawKeyHex);
    let cryptoObj = typeof globalThis !== 'undefined' ? (globalThis.crypto || globalThis.msCrypto) : null;
    if (!cryptoObj && typeof require !== 'undefined') {
        cryptoObj = require('crypto').webcrypto;
    }
    return cryptoObj.subtle.importKey('raw', rawKeyBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
// Generate a random 256-bit AES-GCM key in hex format (e.g. for group chats)
export function generateGroupKeyHex() {
    let cryptoObj = typeof globalThis !== 'undefined' ? (globalThis.crypto || globalThis.msCrypto) : null;
    if (!cryptoObj && typeof require !== 'undefined') {
        cryptoObj = require('crypto').webcrypto;
    }
    const bytes = new Uint8Array(32);
    if (cryptoObj?.getRandomValues) {
        cryptoObj.getRandomValues(bytes);
    }
    else {
        // Math.random fallback for environments without crypto
        for (let i = 0; i < 32; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    return bytesToHex(bytes);
}
// Encrypt plaintext using a derived CryptoKey
export async function encryptWithKey(plaintext, cryptoKey) {
    let cryptoObj = typeof globalThis !== 'undefined' ? (globalThis.crypto || globalThis.msCrypto) : null;
    if (!cryptoObj && typeof require !== 'undefined') {
        cryptoObj = require('crypto').webcrypto;
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    // Generate 12-byte IV for AES-GCM
    const iv = new Uint8Array(12);
    cryptoObj.getRandomValues(iv);
    const encrypted = await cryptoObj.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
    return {
        ciphertext: bytesToBase64(new Uint8Array(encrypted)),
        nonce: bytesToBase64(iv),
    };
}
// Decrypt ciphertext using a derived CryptoKey
export async function decryptWithKey(ciphertextBase64, nonceBase64, cryptoKey) {
    let cryptoObj = typeof globalThis !== 'undefined' ? (globalThis.crypto || globalThis.msCrypto) : null;
    if (!cryptoObj && typeof require !== 'undefined') {
        cryptoObj = require('crypto').webcrypto;
    }
    const ciphertext = base64ToBytes(ciphertextBase64);
    const iv = base64ToBytes(nonceBase64);
    const decrypted = await cryptoObj.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
}
// Convenient pairwise encryption
export async function encryptPairwise(plaintext, myPrivateKeyHex, peerPublicKeyHex) {
    const secret = deriveSharedSecret(myPrivateKeyHex, peerPublicKeyHex);
    const key = await deriveAESKey(secret);
    return encryptWithKey(plaintext, key);
}
// Convenient pairwise decryption
export async function decryptPairwise(ciphertextBase64, nonceBase64, myPrivateKeyHex, peerPublicKeyHex) {
    const secret = deriveSharedSecret(myPrivateKeyHex, peerPublicKeyHex);
    const key = await deriveAESKey(secret);
    return decryptWithKey(ciphertextBase64, nonceBase64, key);
}
