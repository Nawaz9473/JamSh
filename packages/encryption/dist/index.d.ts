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
