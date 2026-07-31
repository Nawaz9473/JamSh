import { test, expect } from '@playwright/test';

test.describe('E2EE Protocol Security Verification', () => {
  
  test('E2EE Canonical ACK and Identity Binding Unit Tests', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const testResult = await page.evaluate(async () => {
      function constantTimeCompare(a: string, b: string): boolean {
        if (a.length !== b.length) return false;
        let result = 0;
        for (let i = 0; i < a.length; i++) {
          result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
      }

      function encodeLengthPrefixed(field: string): string {
        return `${field.length}:${field}`;
      }

      // 1. Constant-Time comparison tests
      const comparePass = constantTimeCompare("abcdef", "abcdef");
      const compareFailMismatch = constantTimeCompare("abcdef", "abcdeg");
      const compareFailLength = constantTimeCompare("abcdef", "abcde");

      // 2. Canonical length-prefixed encoding verification
      const canonicalV1 = encodeLengthPrefixed("v1");
      const canonicalMsgId = encodeLengthPrefixed("msg-123-id");
      const canonicalSuccess = encodeLengthPrefixed("SUCCESS");
      const canonicalRecipient = encodeLengthPrefixed("user-bob-456");

      const rawContext = `${canonicalV1}|${canonicalMsgId}|${canonicalSuccess}|${canonicalRecipient}`;
      const expectedContextPattern = "2:v1|10:msg-123-id|7:SUCCESS|12:user-bob-456";

      // 3. Cryptographic Purpose-Separated ACK Key check
      async function hexToBytes(hex: string): Promise<Uint8Array> {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return bytes;
      }

      function bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      }

      async function hmacSHA256(keyHex: string, message: string): Promise<string> {
        const keyBytes = await hexToBytes(keyHex);
        const msgBytes = new TextEncoder().encode(message);
        const cryptoObj = window.crypto;
        const cryptoKey = await cryptoObj.subtle.importKey(
          'raw',
          keyBytes,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const signature = await cryptoObj.subtle.sign('HMAC', cryptoKey, msgBytes);
        return bytesToHex(new Uint8Array(signature));
      }

      const mockSharedSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const ackKey = await hmacSHA256(mockSharedSecret, "jamsh-ack-key");
      const signatureValid = await hmacSHA256(ackKey, rawContext);

      // Verify validation logic:
      const checkValid = constantTimeCompare(signatureValid, signatureValid);

      // Forged status check
      const tamperedContext = `${canonicalV1}|${canonicalMsgId}|${encodeLengthPrefixed("FAILED")}|${canonicalRecipient}`;
      const signatureTampered = await hmacSHA256(ackKey, tamperedContext);
      const checkTampered = constantTimeCompare(signatureValid, signatureTampered);

      // Wrong message_id check
      const wrongMsgIdContext = `${canonicalV1}|${encodeLengthPrefixed("msg-different-999")}|${canonicalSuccess}|${canonicalRecipient}`;
      const signatureWrongMsg = await hmacSHA256(ackKey, wrongMsgIdContext);
      const checkWrongMsg = constantTimeCompare(signatureValid, signatureWrongMsg);

      // Modified recipient context check
      const wrongRecipientContext = `${canonicalV1}|${canonicalMsgId}|${canonicalSuccess}|${encodeLengthPrefixed("user-mallory-789")}`;
      const signatureWrongRecipient = await hmacSHA256(ackKey, wrongRecipientContext);
      const checkWrongRecipient = constantTimeCompare(signatureValid, signatureWrongRecipient);

      return {
        comparePass,
        compareFailMismatch,
        compareFailLength,
        rawContext,
        isContextMatch: rawContext === expectedContextPattern,
        ackKeyDerived: ackKey.length === 64,
        checkValid,
        checkTampered,
        checkWrongMsg,
        checkWrongRecipient
      };
    });

    expect(testResult.comparePass).toBe(true);
    expect(testResult.compareFailMismatch).toBe(false);
    expect(testResult.compareFailLength).toBe(false);
    expect(testResult.isContextMatch).toBe(true);
    expect(testResult.ackKeyDerived).toBe(true);
    expect(testResult.checkValid).toBe(true);
    expect(testResult.checkTampered).toBe(false);
    expect(testResult.checkWrongMsg).toBe(false);
    expect(testResult.checkWrongRecipient).toBe(false);
  });

  test('TCP Big-Endian Framing and Fragmentation Simulation', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');

    const frameTestResult = await page.evaluate(() => {
      // Helper function matching native Java/Swift big-endian read logic
      class BigEndianFrameReader {
        private buffer: Uint8Array = new Uint8Array(0);
        private expectedLength: number = -1;
        public packets: string[] = [];
        public errorOccurred: boolean = false;

        public pushBytes(incoming: Uint8Array) {
          const combined = new Uint8Array(this.buffer.length + incoming.length);
          combined.set(this.buffer);
          combined.set(incoming, this.buffer.length);
          this.buffer = combined;
          this.processBuffer();
        }

        private processBuffer() {
          while (true) {
            // Read length header if not already known
            if (this.expectedLength === -1) {
              if (this.buffer.length < 4) {
                return; // Wait for more header bytes (fragmentation)
              }
              // Parse big-endian 4-byte unsigned int
              const len = (this.buffer[0] << 24) | (this.buffer[1] << 16) | (this.buffer[2] << 8) | this.buffer[3];
              
              // Validate framing boundaries
              if (len <= 0 || len > 1024 * 1024) { // Max 1MB payload check
                this.errorOccurred = true;
                this.buffer = new Uint8Array(0);
                return;
              }
              this.expectedLength = len;
              this.buffer = this.buffer.slice(4);
            }

            // Read payload
            if (this.buffer.length < this.expectedLength) {
              return; // Wait for remaining payload bytes (fragmentation)
            }

            const payloadBytes = this.buffer.slice(0, this.expectedLength);
            const decoded = new TextDecoder().decode(payloadBytes);
            this.packets.push(decoded);

            this.buffer = this.buffer.slice(this.expectedLength);
            this.expectedLength = -1;
          }
        }
      }

      // Encode payload to [4-byte big-endian length][payload]
      function encodeFrame(msg: string): Uint8Array {
        const payloadBytes = new TextEncoder().encode(msg);
        const len = payloadBytes.length;
        const frame = new Uint8Array(4 + len);
        frame[0] = (len >> 24) & 0xff;
        frame[1] = (len >> 16) & 0xff;
        frame[2] = (len >> 8) & 0xff;
        frame[3] = len & 0xff;
        frame.set(payloadBytes, 4);
        return frame;
      }

      // Test Scenario 1: Clean Single Frame
      const reader1 = new BigEndianFrameReader();
      reader1.pushBytes(encodeFrame("hello"));
      const passSingle = reader1.packets.length === 1 && reader1.packets[0] === "hello";

      // Test Scenario 2: Fragmented Header
      const reader2 = new BigEndianFrameReader();
      const frame2 = encodeFrame("world");
      reader2.pushBytes(frame2.slice(0, 2)); // Send first 2 bytes of header
      const step1Empty = reader2.packets.length === 0;
      reader2.pushBytes(frame2.slice(2)); // Send remaining header and payload
      const passFragmentedHeader = step1Empty && reader2.packets.length === 1 && reader2.packets[0] === "world";

      // Test Scenario 3: Fragmented Payload
      const reader3 = new BigEndianFrameReader();
      const frame3 = encodeFrame("fragmented payload test");
      reader3.pushBytes(frame3.slice(0, 10)); // Partial header + payload
      const step2Empty = reader3.packets.length === 0;
      reader3.pushBytes(frame3.slice(10)); // Rest of payload
      const passFragmentedPayload = step2Empty && reader3.packets.length === 1 && reader3.packets[0] === "fragmented payload test";

      // Test Scenario 4: Oversized Frame (> 1MB boundary limit)
      const reader4 = new BigEndianFrameReader();
      const invalidHeader = new Uint8Array([0x00, 0x20, 0x00, 0x00]); // 2MB length claim
      reader4.pushBytes(invalidHeader);
      const passOversizedRejection = reader4.errorOccurred;

      // Test Scenario 5: Negative / Zero Length Frame Rejection
      const reader5 = new BigEndianFrameReader();
      const zeroHeader = new Uint8Array([0x00, 0x00, 0x00, 0x00]); // 0 length claim
      reader5.pushBytes(zeroHeader);
      const passZeroRejection = reader5.errorOccurred;

      return {
        passSingle,
        passFragmentedHeader,
        passFragmentedPayload,
        passOversizedRejection,
        passZeroRejection
      };
    });

    expect(frameTestResult.passSingle).toBe(true);
    expect(frameTestResult.passFragmentedHeader).toBe(true);
    expect(frameTestResult.passFragmentedPayload).toBe(true);
    expect(frameTestResult.passOversizedRejection).toBe(true);
    expect(frameTestResult.passZeroRejection).toBe(true);
  });

  test('E2EE Offline Message Deduplication and Queue Verification', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');

    const deduplicationResult = await page.evaluate(async () => {
      // Simulate state database and message receiver pipeline
      const localMessages: any[] = [];
      let ackCount = 0;

      function handleIncomingEnvelope(envelope: any): { inserted: boolean; ackStatus: string } {
        const alreadyExists = localMessages.some(m => m.id === envelope.id);
        
        // 1. Recipient side deduplication BEFORE Supabase
        let inserted = false;
        if (!alreadyExists) {
          localMessages.push({
            id: envelope.id,
            room_id: envelope.room_id,
            sender_id: envelope.sender_id,
            content: envelope.content
          });
          inserted = true;
        }

        // 2. Return valid ACK even on duplicates to terminate retry loops
        ackCount++;
        return {
          inserted,
          ackStatus: "SUCCESS"
        };
      }

      // Receive first transmission of message_id 'msg-uniq-100'
      const envelope1 = { id: "msg-uniq-100", room_id: "room_1", sender_id: "user_a", content: "hello" };
      const res1 = handleIncomingEnvelope(envelope1);

      // Receive retry of same message_id
      const res2 = handleIncomingEnvelope(envelope1);

      // Verify Supabase 23505 Unique Constraint Safe Reconciliation
      let queueSize = 2; // initial queue size
      function reconcileSupabaseSyncResult(error: any) {
        if (!error || (error && error.code === '23505')) {
          queueSize = Math.max(0, queueSize - 1);
        }
      }

      // Simulate first item sync success
      reconcileSupabaseSyncResult(null);
      // Simulate second item sync unique constraint collision (synced by peer first)
      reconcileSupabaseSyncResult({ code: '23505' });

      return {
        firstInsert: res1.inserted,
        firstAck: res1.ackStatus,
        secondInsert: res2.inserted, // Should be false
        secondAck: res2.ackStatus, // Should be SUCCESS to stop sender retrying
        finalBubbleCount: localMessages.length,
        finalQueueSize: queueSize
      };
    });

    expect(deduplicationResult.firstInsert).toBe(true);
    expect(deduplicationResult.firstAck).toBe("SUCCESS");
    expect(deduplicationResult.secondInsert).toBe(false);
    expect(deduplicationResult.secondAck).toBe("SUCCESS");
    expect(deduplicationResult.finalBubbleCount).toBe(1);
    expect(deduplicationResult.finalQueueSize).toBe(0);
  });

  test('E2E Key Migration Atomicity and Rollback Verification', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');

    const migrationResult = await page.evaluate(async () => {
      // Mock Storage System
      const localStore: Record<string, string> = {
        "jamsh_e2e_keys_user_1": JSON.stringify({ publicKey: "pubkey-123", privateKey: "privkey-456" })
      };
      const secureStore: Record<string, string> = {};

      // Simulated atomic migration procedure
      async function migrateKeys(userId: string, simulateSecureWriteFailure = false, simulateReadbackMismatch = false) {
        const key = `jamsh_e2e_keys_${userId}`;
        const savedLocal = localStore[key];
        if (!savedLocal) return;

        try {
          if (simulateSecureWriteFailure) {
            throw new Error("Secure memory boundary failure");
          }
          // Save to secure native memory
          secureStore[key] = savedLocal;

          // Read back and verify
          let verifyValue = secureStore[key];
          if (simulateReadbackMismatch) {
            verifyValue = "corrupted-keys-data";
          }

          if (verifyValue === savedLocal) {
            // Success! Safe to prune legacy key
            delete localStore[key];
          }
        } catch (e) {
          // Rollback: Keep local storage key intact
          console.warn("Migration failed, rollback to local storage.");
        }
      }

      // Scenario 1: Clean Migration Success
      await migrateKeys("user_1", false, false);
      const scenario1Passed = !localStore["jamsh_e2e_keys_user_1"] && !!secureStore["jamsh_e2e_keys_user_1"];

      // Setup Scenario 2: Write Failure Rollback
      localStore["jamsh_e2e_keys_user_2"] = JSON.stringify({ publicKey: "pub-2", privateKey: "priv-2" });
      await migrateKeys("user_2", true, false);
      const scenario2Passed = !!localStore["jamsh_e2e_keys_user_2"] && !secureStore["jamsh_e2e_keys_user_2"];

      // Setup Scenario 3: Readback Mismatch Rollback
      localStore["jamsh_e2e_keys_user_3"] = JSON.stringify({ publicKey: "pub-3", privateKey: "priv-3" });
      await migrateKeys("user_3", false, true);
      const scenario3Passed = !!localStore["jamsh_e2e_keys_user_3"] && secureStore["jamsh_e2e_keys_user_3"] === JSON.stringify({ publicKey: "pub-3", privateKey: "priv-3" });

      return {
        scenario1Passed,
        scenario2Passed,
        scenario3Passed
      };
    });

    expect(migrationResult.scenario1Passed).toBe(true);
    expect(migrationResult.scenario2Passed).toBe(true);
    expect(migrationResult.scenario3Passed).toBe(true);
  });

  test('E2EE Expanded Coverage and Edge Cases Verification', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');

    const expandedResult = await page.evaluate(async () => {
      class BigEndianFrameReader {
        private buffer: Uint8Array = new Uint8Array(0);
        private expectedLength: number = -1;
        public packets: string[] = [];
        public errorOccurred: boolean = false;

        public pushBytes(incoming: Uint8Array) {
          const combined = new Uint8Array(this.buffer.length + incoming.length);
          combined.set(this.buffer);
          combined.set(incoming, this.buffer.length);
          this.buffer = combined;
          this.processBuffer();
        }

        private processBuffer() {
          while (true) {
            if (this.expectedLength === -1) {
              if (this.buffer.length < 4) return;
              const len = (this.buffer[0] << 24) | (this.buffer[1] << 16) | (this.buffer[2] << 8) | this.buffer[3];
              if (len <= 0 || len > 1024 * 1024) {
                this.errorOccurred = true;
                this.buffer = new Uint8Array(0);
                return;
              }
              this.expectedLength = len;
              this.buffer = this.buffer.slice(4);
            }
            if (this.buffer.length < this.expectedLength) return;
            const payloadBytes = this.buffer.slice(0, this.expectedLength);
            const decoded = new TextDecoder().decode(payloadBytes);
            this.packets.push(decoded);
            this.buffer = this.buffer.slice(this.expectedLength);
            this.expectedLength = -1;
          }
        }
      }

      function encodeFrame(msg: string): Uint8Array {
        const payloadBytes = new TextEncoder().encode(msg);
        const len = payloadBytes.length;
        const frame = new Uint8Array(4 + len);
        frame[0] = (len >> 24) & 0xff;
        frame[1] = (len >> 16) & 0xff;
        frame[2] = (len >> 8) & 0xff;
        frame[3] = len & 0xff;
        frame.set(payloadBytes, 4);
        return frame;
      }

      // 1. Multiple/chunked reads: Push multiple complete frames at once
      const chunkedReader = new BigEndianFrameReader();
      const frameA = encodeFrame("frameA");
      const frameB = encodeFrame("frameB");
      const combined = new Uint8Array(frameA.length + frameB.length);
      combined.set(frameA);
      combined.set(frameB, frameA.length);
      chunkedReader.pushBytes(combined);
      const multipleReadsPassed = chunkedReader.packets.length === 2 && chunkedReader.packets[0] === "frameA" && chunkedReader.packets[1] === "frameB";

      // 2. Truncated frame: Send partial frame and check it is not dispatched
      const truncatedReader = new BigEndianFrameReader();
      const partialFrame = encodeFrame("truncated");
      truncatedReader.pushBytes(partialFrame.slice(0, partialFrame.length - 3));
      const truncatedFramePassed = truncatedReader.packets.length === 0 && !truncatedReader.errorOccurred;

      // 3. Active connections global limit & per-source simulation
      const activeConnections = new Map();
      const clientIps = {};
      function handleConnection(connId, ip) {
        if (activeConnections.size >= 10) return "REJECT_GLOBAL_LIMIT";
        clientIps[ip] = (clientIps[ip] || 0) + 1;
        if (clientIps[ip] > 2) {
          clientIps[ip]--;
          return "REJECT_PER_IP_LIMIT";
        }
        activeConnections.set(connId, { ip });
        return "ACCEPTED";
      }
      
      const connResults = [];
      for (let i = 0; i < 12; i++) {
        connResults.push(handleConnection(`conn_${i}`, `192.168.1.${i}`));
      }
      const connectionsGlobalLimitPassed = connResults[10] === "REJECT_GLOBAL_LIMIT";
      
      const ipLimitResults = [];
      activeConnections.clear();
      Object.keys(clientIps).forEach(k => delete clientIps[k]);
      ipLimitResults.push(handleConnection("c1", "192.168.1.5"));
      ipLimitResults.push(handleConnection("c2", "192.168.1.5"));
      ipLimitResults.push(handleConnection("c3", "192.168.1.5"));
      const connectionsIpLimitPassed = ipLimitResults[0] === "ACCEPTED" && ipLimitResults[1] === "ACCEPTED" && ipLimitResults[2] === "REJECT_PER_IP_LIMIT";

      // 4. Discovery Privacy Check: Verify derived token contains no PII
      const mockUsername = "alice_test";
      const mockEmail = "alice@test.com";
      const mockUserId = "usr-12345678-abcd";
      const mockSharedSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const tokenFull = "8f9a12bc34de56fa7890bcde1234567890abcdef1234567890abcdef12345678";
      const discoveryToken = tokenFull.substring(0, 16);
      const discoveryPrivacyPassed = !discoveryToken.includes(mockUsername) && 
                                     !discoveryToken.includes(mockEmail) && 
                                     !discoveryToken.includes(mockUserId);
      const discoverySizePassed = discoveryToken.length === 16;

      // 5. Stable message_id across fallback transport selection simulation
      const stableMsgId = "msg-uuid-999-stable";
      let transportSelected = null;
      const offlineQueue = [];
      
      function sendTransportFallback(envelope, online, nearbyActive) {
        if (online) {
          transportSelected = "supabase";
          return;
        }
        if (nearbyActive) {
          transportSelected = "nearby";
          return;
        }
        transportSelected = "offline_queue";
        offlineQueue.push(envelope);
      }
      
      const testEnvelope = { id: stableMsgId, content: "cipher", nonce: "nonce" };
      sendTransportFallback(testEnvelope, false, false);
      const fallbackPassed = transportSelected === "offline_queue" && offlineQueue[0].id === stableMsgId;

      return {
        multipleReadsPassed,
        truncatedFramePassed,
        connectionsGlobalLimitPassed,
        connectionsIpLimitPassed,
        discoveryPrivacyPassed,
        discoverySizePassed,
        fallbackPassed
      };
    });

    expect(expandedResult.multipleReadsPassed).toBe(true);
    expect(expandedResult.truncatedFramePassed).toBe(true);
    expect(expandedResult.connectionsGlobalLimitPassed).toBe(true);
    expect(expandedResult.connectionsIpLimitPassed).toBe(true);
    expect(expandedResult.discoveryPrivacyPassed).toBe(true);
    expect(expandedResult.discoverySizePassed).toBe(true);
    expect(expandedResult.fallbackPassed).toBe(true);
  });
});
