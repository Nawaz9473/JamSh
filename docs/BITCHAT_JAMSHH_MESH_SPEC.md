# JAMSHH BLE Mesh Protocol Specification
*Inspired by Bitchat Architecture and Whitepaper*

**Version:** 1.0.0  
**Status:** Implemented  
**Date:** November 2026  

---

## 1. Overview & Architectural Goals

The **JAMSHH BLE Mesh Protocol** enables peer-to-peer, decentralized, multi-hop communication between mobile devices (Android and iOS) without requiring an active cellular connection, local Wi-Fi router, or central server.

It adapts core architectural concepts from **Bitchat** (developed by permissionlesstech / Jack Dorsey):
1. **Compact Legacy-Compliant BLE Advertising**: Beacons strictly fit within the standard 31-byte Bluetooth advertising packet.
2. **Binary Framing & Serialization**: Eliminates heavy JSON overhead in radio transit.
3. **Packet Fragmentation & Reassembly (MTU Slicing)**: Bounded fragmentation engine overcoming GATT characteristic size limits.
4. **Epidemic Multi-Hop Mesh Routing**: Decentralized flood/gossip relaying with TTL hop limits and duplicate packet suppression.
5. **Purpose-Separated Authenticated Delivery ACKs**: Cryptographic MAC verifying that the recipient processed the message.
6. **Decentralized Offline Pairing**: QR-code-based key exchange allowing users who have never synchronized with Supabase to communicate securely.
7. **Hybrid Synchronization Reconciliation**: Transparently reconciles with Supabase when internet connectivity becomes available.

---

## 2. Binary Packet Specification

All multi-byte integer fields are encoded in **Network Byte Order (Big-Endian)**.

### 2.1 Packet Types

| Type Code | Name | Description |
|---|---|---|
| `0x01` | `DIRECT_MSG` | Direct point-to-point encrypted payload |
| `0x02` | `RELAY_MSG` | Multi-hop mesh relay message traversing intermediate nodes |
| `0x03` | `DELIVERY_ACK` | Cryptographically signed delivery acknowledgement |
| `0x04` | `FRAGMENT` | Fragment chunk of a larger segmented message |
| `0x05` | `PAIR_REQ` | Offline local pairing request (name + public key) |
| `0x06` | `PAIR_RESP` | Offline local pairing response (name + public key) |

### 2.2 Wire Framing Layout

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  Magic (0x4A) |  Ver (0x01)   |  Packet Type  |     TTL       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Hop Count   | Flags (0x00)  |        Payload Length         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                       Message ID (16 bytes)                   +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Sender Fingerprint (8 bytes)                |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                  Recipient Fingerprint (8 bytes)              |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Timestamp (uint32 s)                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Payload Bytes (N bytes)                 |
|                              ...                              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        CRC32 Checksum                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

* **Header Size**: 44 bytes.
* **Trailer Size**: 4 bytes (CRC32 IEEE 802.3).
* **Total Framing Overhead**: 48 bytes.

---

## 3. Fragmentation and Reassembly Engine

To ensure compatibility across Android and iOS without dropping packets on small ATT MTU connections, any serialized packet exceeding **420 bytes** is divided into sequential fragments (`PACKET_TYPE = 0x04`).

### 3.1 Fragment Header Structure

* **Fragment Index**: 2 bytes (0-indexed, `uint16`).
* **Total Fragments**: 2 bytes (`uint16`).
* **Original Message ID**: 16 bytes.
* **Chunk Length**: 2 bytes (`uint16`).
* **Chunk Data**: Up to 400 bytes.

### 3.2 Reassembly Pool Rules

* Reassembly buffers are keyed by `(sender_fingerprint, message_id)`.
* Each reassembly buffer has a **30-second sliding expiration window**.
* Missing fragments trigger an internal retry or expiry cleanup.
* Once `received_count == total_fragments`, the original byte array is reconstructed and its CRC32 checksum is verified before forwarding or decrypting.

---

## 4. Multi-Hop Mesh Routing Protocol

### 4.1 Participating Node State

Every device running JAMSHH operates in dual Central + Peripheral mode:
* **GATT Server**: Advertises the standardized JAMSHH Mesh Service UUID `0000fd6f-0000-1000-8000-00805f9b34fb` and listens for incoming writes.
* **GATT Client**: Scans for the same Service UUID and connects to discovered peers to deliver direct messages or relay packets.

### 4.2 Relay Decision Matrix

When a packet is received:
1. **Deduplication Check**: Compute FNV-1a / CRC32 hash of the immutable header + payload. If present in `seen_packets`, drop immediately.
2. **TTL Verification**: If `TTL <= 1`, drop the packet (hop budget exhausted).
3. **Target Assessment**:
   * If `recipient_fingerprint == my_fingerprint`: Pass payload to E2EE Decryption Layer. If valid, dispatch authenticated ACK.
   * If `recipient_fingerprint != my_fingerprint`:
     * Decrement `TTL` by 1.
     * Increment `Hop Count` by 1.
     * Insert packet into persistent SQLite `ble_mesh_queue`.
     * Dispatch to active BLE peers via GATT write.

---

## 5. Security & Cryptographic Handshake

### 5.1 Key Derivation

* **Identity**: Pairwise X25519 Curve25519 keypair.
* **Peer Fingerprint**: Truncated 8-byte SHA-256 hash of the peer's public key:
  $$\text{Fingerprint} = \text{SHA256}(\text{PublicKeyHex})[0..7]$$
* **Symmetric Encryption**: 256-bit AES-GCM with a fresh 12-byte cryptographic IV per message.

### 5.2 Authenticated Delivery ACK

1. Shared secret derived via X25519 Diffie-Hellman:
   $$S_{AB} = \text{X25519}(K_{\text{priv, recipient}}, K_{\text{pub, sender}})$$
2. Purpose-separated ACK key:
   $$K_{\text{ack}} = \text{HMAC-SHA256}(S_{AB}, \text{"jamsh-mesh-ack"})$$
3. Deterministic ACK Signature:
   $$\text{AckSig} = \text{HMAC-SHA256}(K_{\text{ack}}, \text{MessageID} \mathbin{\Vert} \text{"SUCCESS"})$$
4. Sender validates `AckSig` via constant-time equality check before updating message state to `⚡ Delivered nearby`.

---

## 6. Offline Pairing Protocol

To enable users to converse offline without having previously synchronized through Supabase:
1. User A presents a **JAMSHH Offline Pairing QR Code** containing:
   `jamsh-pair://v1?id=<userId>&name=<username>&pub=<x25519PublicKeyHex>&fp=<8byteFingerprintHex>`
2. User B scans the QR code.
3. Both clients store the respective public key in `localStorage` under `jamsh_public_key_cache_<myUserId>`.
4. Subsequent BLE discovery packets match the 8-byte fingerprint and decrypt pairwise messages without central server interaction.
