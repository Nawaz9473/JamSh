# JamSh: Hybrid Offline E2EE Messaging Physical-Device Test Plan

This test plan defines the step-by-step verification procedures, edge-case tests, latency measurements, and acceptance checklists to validate the offline nearby E2EE messaging implementation on physical devices.

---

## 1. Test Setup Prerequisites

Before starting any offline physical-device testing, ensure:
1. **Prior Contact & Key Cache**: Both devices must have logged in online at least once, successfully searched/followed each other, established an E2EE conversation room, and cached each other's E2EE public keys.
2. **Mobile Data/Internet**: Disabled completely on both devices (airplane mode enabled, with only Wi-Fi/Hotspot turned back on).
3. **Build Versions**: Both devices must run the same build of the JamSh application.

---

## 2. Test Execution Checklists

### Test T1: Android ↔ Android (Shared Local Network / No Internet)
- [ ] Connect both Android devices to a shared local Wi-Fi router (with WAN/Internet cable disconnected) or connect Device B to Device A's portable hotspot.
- [ ] Disable cellular/mobile data on both devices.
- [ ] Launch JamSh on both devices.
- [ ] Verify UDP discovery succeeds (peer indicator shows active).
- [ ] Verify packet capture contains **no** plaintext usernames, emails, or permanent identifiers.
- [ ] Send E2EE message from Device A to Device B.
- [ ] Verify signature validates and message appears decrypted on Device B.
- [ ] Verify Device A displays `⚡ Sent nearby` *only* after a valid authenticated ACK is received.
- [ ] Send E2EE reply from Device B to Device A and verify the same ACK marking.
- [ ] Restore internet and verify sync reconciliation deduplicates successfully (exactly one bubble).

### Test T2: Android Hotspot ↔ iPhone
- [ ] Enable Wi-Fi Hotspot on the Android device.
- [ ] Connect the iPhone to the Android Hotspot.
- [ ] Disable cellular/mobile data on both devices.
- [ ] Launch JamSh on both devices.
- [ ] Verify UDP discovery succeeds (iPhone scans and resolves Android IP, or Bonjour resolves iPhone IP).
- [ ] Send message from Android to iPhone, verify decryption and `⚡ Sent nearby` ACK.
- [ ] Send message from iPhone to Android, verify decryption and `⚡ Sent nearby` ACK.
- [ ] Restore internet and verify sync reconciliation.

### Test T3: iPhone Hotspot ↔ Android
- [ ] Enable Wi-Fi Hotspot on the iPhone.
- [ ] Connect the Android device to the iPhone Hotspot.
- [ ] Disable cellular/mobile data on both devices.
- [ ] Launch JamSh.
- [ ] Verify UDP discovery and address resolution succeed.
- [ ] Send message from iPhone to Android, verify decryption and ACK.
- [ ] Send message from Android to iPhone, verify decryption and ACK.

### Test T4: iPhone ↔ iPhone (Shared Local Network / No Internet)
- [ ] Connect both iPhones to a shared local Wi-Fi network (no internet) or connect iPhone B to iPhone A's hotspot.
- [ ] Launch JamSh on both devices.
- [ ] Verify UDP Bonjour discovery resolves local endpoints.
- [ ] Send bidirectional messages and verify E2EE decryption and authenticated ACK marking.

---

## 3. Crash-Persistence Test (SQLite Durable Queue)

- [ ] **Step 1**: Disable cellular/mobile data and Wi-Fi on Device A (fully disconnected, no recipient nearby).
- [ ] **Step 2**: Open an E2EE conversation room and send a message.
- [ ] **Step 3**: Verify the message bubble renders with the status `🕒 Queued`.
- [ ] **Step 4**: Force-kill the JamSh application (swipe away from app switcher/terminate process).
- [ ] **Step 5**: Relaunch JamSh on Device A.
- [ ] **Step 6**: Verify that the queued message still exists in the room history with `🕒 Queued` status.
- [ ] **Step 7**: Re-enable Wi-Fi/Internet on Device A.
- [ ] **Step 8**: Verify that the queue synchronization triggers automatically and uploads the message.
- [ ] **Step 9**: Verify exactly one logical message exists in the database and renders in the UI (no duplicates).

---

## 4. Native Networking Edge Cases

- [ ] **Peer Disconnect**: Disconnect the recipient device's Wi-Fi mid-transmission. Verify the sender socket fails gracefully and preserves the message in the offline queue (reverts status to `🕒 Queued`).
- [ ] **Interface Change**: Toggle hotspot off and connect to a different local router during delivery. Verify active sockets close safely, rebind to new local interfaces, and clear stale IP cache entries.
- [ ] **TCP Timeout**: Simulate a hanging TCP socket. Verify that the native socket times out after 15 seconds, closes the handler, and releases thread resources.
- [ ] **Global Limit (DoS)**: Flood the native TCP port 8383 with 15 simultaneous socket connections. Verify that the 11th and subsequent connections are immediately closed/rejected by the native concurrency filter.
- [ ] **Source Throttling**: Initiate 3 concurrent socket connections from a single IP address. Verify that the 3rd connection is blocked by the per-source limit of 2 concurrent connections.
- [ ] **Malformed Frame**: Send random binary noise without a length header. Verify the server rejects the packet and closes the socket immediately without crashing the native thread.
- [ ] **Oversized Frame**: Send a frame claiming a payload size of 5MB. Verify the length-check limits reject the request and close the socket without allocating memory buffers.
- [ ] **App Transition**: Move the app to the background on both devices. On iOS, verify sockets cancel within 5 seconds. On foreground return, verify listeners re-initialize and resume UDP advertising/scanning.
- [ ] **Screen Lock**: Lock the screen on the device, send a P2P packet, and verify queue failure handling. Lock/unlock the recipient device, verify re-discovery triggers, and sync reconciles when active.

---

## 5. Latency & Batch Rotation Measurements

Record the discovery delay (time from turning Wi-Fi on to peer indicator active) across different cache sizes:

| Conversation Peer Count | Discovery Latency (seconds) | Batch Rotation Issues (Yes/No) |
| :--- | :--- | :--- |
| **1 cached peer** | | |
| **5 cached peers** | | |
| **25 cached peers** | | |
| **50+ cached peers** | | |

*Determine if the 5-token/30-second sliding batch window introduces noticeable latency during peer discovery.*

---

## 6. Physical-Device Test Results Matrix

| Target Feature | Test Performed | Result (PASS/FAIL/NOT VERIFIED) |
| :--- | :--- | :--- |
| **Android native compilation** | `./gradlew assembleDebug` | **NOT VERIFIED** |
| **iOS native compilation** | Xcode compilation check | **NOT VERIFIED** |
| **Android ↔ Android offline** | Test T1 | **NOT VERIFIED** |
| **iPhone ↔ iPhone offline** | Test T4 | **NOT VERIFIED** |
| **Android → iPhone offline** | Test T2 | **NOT VERIFIED** |
| **iPhone → Android offline** | Test T3 | **NOT VERIFIED** |
| **Authenticated ACK** | Verify E2EE ACK signature validation | **NOT VERIFIED** |
| **Force-kill queue persistence** | Crash-persistence test case | **NOT VERIFIED** |
| **Supabase sync reconciliation** | Reconnect sync with code 23505 | **NOT VERIFIED** |
| **Zero duplicate messages** | Sync deduplication check | **NOT VERIFIED** |
