import Foundation
import Capacitor
import CoreBluetooth
import CoreLocation
import SQLite3
import Network

@objc(JamshNearbyPlugin)
public class JamshNearbyPlugin: CAPPlugin, CBCentralManagerDelegate, CBPeripheralManagerDelegate, CLLocationManagerDelegate {
    
    private var db: OpaquePointer?
    
    // CoreBluetooth Managers
    private var centralManager: CBCentralManager?
    private var peripheralManager: CBPeripheralManager?
    
    // GATT Service & Characteristic Config
    private let serviceUUID = CBUUID(string: "0000fd6f-0000-1000-8000-00805f9b34fb")
    private let characteristicWriteUUID = CBUUID(string: "0000fd6f-0001-1000-8000-00805f9b34fb")
    private let characteristicReadUUID = CBUUID(string: "0000fd6f-0002-1000-8000-00805f9b34fb")
    
    private var writeCharacteristic: CBMutableCharacteristic?
    private var readCharacteristic: CBMutableCharacteristic?
    
    private var isAdvertising = false
    private var isScanning = false
    
    private var discoveredPeripherals: [String: CBPeripheral] = [:]
    private var pendingAcks: [String: String] = [:]
    
    // Incoming chunk reassembly dictionary: senderUUID -> (messageId, totalChunks, collectedChunks)
    private var incomingChunks: [String: [Int: Data]] = [:]
    private var incomingTotalChunks: [String: Int] = [:]
    
    // Active send state for chunked writes: peripheralUUID -> (call, chunks, currentIndex, writeChar)
    private var activeSends: [String: (call: CAPPluginCall, chunks: [Data], currentIndex: Int, writeChar: CBCharacteristic?)] = [:]
    
    // Network Path Monitor
    private let pathMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(label: "JamshNetworkMonitor")
    private var isNetworkConnected = true
    
    // CoreLocation
    private var locationManager: CLLocationManager?
    private var lastKnownLatitude: Double = 0.0
    private var lastKnownLongitude: Double = 0.0
    
    // Active client calls
    private var pendingSendCalls: [String: CAPPluginCall] = [:]
    
    override public func load() {
        super.load()
        initDatabase()
        setupConnectivityListener()
        
        // Initialize CoreBluetooth managers
        centralManager = CBCentralManager(delegate: self, queue: nil, options: [
            CBCentralManagerOptionRestoreIdentifierKey: "JamshCentralRestoreKey"
        ])
        peripheralManager = CBPeripheralManager(delegate: self, queue: nil, options: [
            CBPeripheralManagerOptionRestoreIdentifierKey: "JamshPeripheralRestoreKey"
        ])
        
        // Initialize Location
        locationManager = CLLocationManager()
        locationManager?.delegate = self
        locationManager?.desiredAccuracy = kCLLocationAccuracyBest
        locationManager?.requestWhenInUseAuthorization()
        locationManager?.startUpdatingLocation()
    }
    
    // -----------------------------------------------------------------
    // SECURE STORAGE (KEYCHAIN)
    // -----------------------------------------------------------------
    
    @objc func saveSecure(_ call: CAPPluginCall) {
        guard let key = call.getString("key"),
              let value = call.getString("value"),
              let data = value.data(using: .utf8) else {
            call.reject("Key and Value must not be null")
            return
        }
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]
        
        SecItemDelete(query as CFDictionary)
        
        let status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("Keychain save failed with status: \(status)")
        }
    }
    
    @objc func getSecure(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("Key must not be null")
            return
        }
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: kCFBooleanTrue!,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
        
        if status == errSecSuccess, let data = dataTypeRef as? Data, let value = String(data: data, encoding: .utf8) {
            call.resolve([
                "value": value
            ])
        } else if status == errSecItemNotFound {
            call.resolve([:])
        } else {
            call.reject("Keychain fetch failed with status: \(status)")
        }
    }
    
    @objc func removeSecure(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("Key must not be null")
            return
        }
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        
        SecItemDelete(query as CFDictionary)
        call.resolve()
    }
    
    // -----------------------------------------------------------------
    // LOCATION GEOGRAPHIC ENFORCEMENT
    // -----------------------------------------------------------------
    
    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if let location = locations.last {
            lastKnownLatitude = location.coordinate.latitude
            lastKnownLongitude = location.coordinate.longitude
        }
    }
    
    @objc func getCurrentLocation(_ call: CAPPluginCall) {
        call.resolve([
            "latitude": lastKnownLatitude,
            "longitude": lastKnownLongitude
        ])
    }
    
    private func calculateDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        let R = 6371e3 // meters
        let phi1 = lat1 * .pi / 180
        let phi2 = lat2 * .pi / 180
        let deltaPhi = (lat2 - lat1) * .pi / 180
        let deltaLambda = (lon2 - lon1) * .pi / 180
        
        let a = sin(deltaPhi / 2) * sin(deltaPhi / 2) +
                cos(phi1) * cos(phi2) *
                sin(deltaLambda / 2) * sin(deltaLambda / 2)
        let c = 2 * atan2(sqrt(a), sqrt(1 - a))
        
        return R * c // in meters
    }
    
    // -----------------------------------------------------------------
    // HYBRID BLUETOOTH LE ENGINE (CENTRAL & PERIPHERAL ROLES)
    // -----------------------------------------------------------------
    
    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        print("[Nearby iOS] Central Manager status: \(central.state.rawValue)")
    }
    
    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        if peripheral.state == .poweredOn {
            setupGattService()
        }
    }
    
    private func setupGattService() {
        writeCharacteristic = CBMutableCharacteristic(
            type: characteristicWriteUUID,
            properties: [.write, .writeWithoutResponse],
            value: nil,
            permissions: [.writeable]
        )
        
        readCharacteristic = CBMutableCharacteristic(
            type: characteristicReadUUID,
            properties: [.read],
            value: nil,
            permissions: [.readable]
        )
        
        let service = CBMutableService(type: serviceUUID, primary: true)
        service.characteristics = [writeCharacteristic!, readCharacteristic!]
        
        peripheralManager?.add(service)
    }
    
    @objc func startAdvertising(_ call: CAPPluginCall) {
        guard let discoveryId = call.getString("discoveryId") else {
            call.reject("discoveryId is required")
            return
        }
        
        stopAdvertisingInternal()
        
        // Ensure compact payload fits in legacy 31-byte advertising packet
        var activeDiscoveryPayload = "\(discoveryId)|\(isNetworkConnected ? "1" : "0")"
        if activeDiscoveryPayload.count > 10 {
            activeDiscoveryPayload = String(activeDiscoveryPayload.prefix(10))
        }
        
        isAdvertising = true
        peripheralManager?.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [serviceUUID],
            CBAdvertisementDataLocalNameKey: activeDiscoveryPayload
        ])
        call.resolve()
    }
    
    @objc func stopAdvertising(_ call: CAPPluginCall) {
        stopAdvertisingInternal()
        call.resolve()
    }
    
    private func stopAdvertisingInternal() {
        isAdvertising = false
        peripheralManager?.stopAdvertising()
    }
    
    @objc func startScanning(_ call: CAPPluginCall) {
        stopScanningInternal()
        isScanning = true
        centralManager?.scanForPeripherals(withServices: [serviceUUID], options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false
        ])
        call.resolve()
    }
    
    @objc func stopScanning(_ call: CAPPluginCall) {
        stopScanningInternal()
        call.resolve()
    }
    
    private func stopScanningInternal() {
        isScanning = false
        centralManager?.stopScan()
    }
    
    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi NSNumber) {
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? ""
        let mac = peripheral.identifier.uuidString
        discoveredPeripherals[mac] = peripheral
        
        var discoveryId = name
        var peerIsOnline = false
        if name.contains("|") {
            let parts = name.split(separator: "|")
            discoveryId = String(parts[0])
            peerIsOnline = parts.count > 1 && parts[1] == "1"
        }
        
        let peer: [String: Any] = [
            "discoveryId": discoveryId,
            "ip": mac,
            "isOnline": peerIsOnline
        ]
        
        notifyListeners("peerDiscovered", data: ["peer": peer])
    }
    
    // -----------------------------------------------------------------
    // GATT SERVER CALLBACKS (RECEIVE & FRAGMENT REASSEMBLY)
    // -----------------------------------------------------------------
    
    public func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            if request.characteristic.uuid == characteristicWriteUUID, let data = request.value {
                let centralId = request.central.identifier.uuidString
                var completeData: Data? = nil
                
                // Inspect framing: chunked or unchunked
                if data.count >= 2 && data[0] != 0x7B { // Not raw JSON '{'
                    let chunkIndex = Int(data[0])
                    let totalChunks = Int(data[1])
                    let chunkPayload = data.subdata(in: 2..<data.count)
                    
                    if incomingChunks[centralId] == nil {
                        incomingChunks[centralId] = [:]
                        incomingTotalChunks[centralId] = totalChunks
                    }
                    incomingChunks[centralId]?[chunkIndex] = chunkPayload
                    
                    if let collected = incomingChunks[centralId], collected.count == totalChunks {
                        var combined = Data()
                        for i in 0..<totalChunks {
                            if let c = collected[i] {
                                combined.append(c)
                            }
                        }
                        incomingChunks.removeValue(forKey: centralId)
                        incomingTotalChunks.removeValue(forKey: centralId)
                        completeData = combined
                    }
                } else {
                    completeData = data
                }
                
                if let fullData = completeData {
                    handleCompleteMessageReceived(fullData, centralId: centralId)
                }
                
                peripheral.respond(to: request, withResult: .success)
            } else {
                peripheral.respond(to: request, withResult: .requestNotSupported)
            }
        }
    }
    
    private func handleCompleteMessageReceived(_ data: Data, centralId: String) {
        do {
            guard let envelope = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
                  let msgId = envelope["id"] as? String,
                  let originLat = envelope["origin_lat"] as? Double ?? (envelope["origin_lat"] as? NSNumber)?.doubleValue,
                  let originLng = envelope["origin_lng"] as? Double ?? (envelope["origin_lng"] as? NSNumber)?.doubleValue,
                  let roomId = envelope["room_id"] as? String,
                  let recipientId = envelope["recipient_id"] as? String else {
                return
            }
            
            let relayRadius = (envelope["relay_radius"] as? Double) ?? 5000.0
            let hopCount = (envelope["hop_count"] as? Int) ?? 0
            let maxHops = (envelope["max_hops"] as? Int) ?? 8
            
            if hopCount > maxHops { return }
            
            // 1. Seen packet duplicate suppression
            if isMessageDuplicate(msgId) {
                return
            }
            markMessageSeen(msgId)
            
            // 2. Geofence radius validation
            let dist = calculateDistance(lat1: lastKnownLatitude, lon1: lastKnownLongitude, lat2: originLat, lon2: originLng)
            if dist > relayRadius { return }
            
            // 3. Target vs Relay Routing
            let myUserId = UserDefaults.standard.string(forKey: "user_id") ?? ""
            
            if recipientId == myUserId || recipientId == "group" {
                notifyListeners("messageReceived", data: [
                    "connectionId": centralId,
                    "envelope": envelope
                ])
            } else {
                // Multi-hop mesh relay: store locally
                var mutableEnvelope = envelope
                mutableEnvelope["hop_count"] = hopCount + 1
                let relayedData = try JSONSerialization.data(withJSONObject: mutableEnvelope, options: [])
                let relayedStr = String(data: relayedData, encoding: .utf8) ?? ""
                
                insertRelayMessage(messageId: msgId, roomId: roomId, recipientId: recipientId, envelopeJson: relayedStr, lat: originLat, lng: originLng, radius: relayRadius)
                
                // Notify JS layer of relay packet arrival
                notifyListeners("relayMessageReceived", data: [
                    "messageId": msgId,
                    "envelope": mutableEnvelope
                ])
                
                // If online, immediately upload to Supabase cloud
                if isNetworkConnected {
                    notifyListeners("relayUploadTrigger", data: [
                        "messageId": msgId,
                        "roomId": roomId,
                        "recipientId": recipientId,
                        "envelope": mutableEnvelope
                    ])
                }
            }
            
            // Pre-cache preliminary ACK in case client reads immediately
            let defaultAck: [String: Any] = [
                "protocol_version": "1.0",
                "message_id": msgId,
                "ack_status": "SUCCESS",
                "authenticated": false
            ]
            if let ackData = try? JSONSerialization.data(withJSONObject: defaultAck, options: []),
               let ackStr = String(data: ackData, encoding: .utf8) {
                pendingAcks[centralId] = ackStr
            }
        } catch {
            print("[Nearby iOS] Failed to parse complete envelope: \(error)")
        }
    }
    
    public func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        if request.characteristic.uuid == characteristicReadUUID {
            let ackStr = pendingAcks.removeValue(forKey: request.central.identifier.uuidString) ?? "{}"
            request.value = ackStr.data(using: .utf8)
            peripheral.respond(to: request, withResult: .success)
        } else {
            peripheral.respond(to: request, withResult: .requestNotSupported)
        }
    }
    
    @objc func respondToEnvelope(_ call: CAPPluginCall) {
        let connectionId = call.getString("connectionId") ?? ""
        if let ackObj = call.getObject("ack"),
           let ackData = try? JSONSerialization.data(withJSONObject: ackObj, options: []),
           let ackStr = String(data: ackData, encoding: .utf8) {
            pendingAcks[connectionId] = ackStr
        }
        call.resolve()
    }
    
    // -----------------------------------------------------------------
    // GATT CLIENT CALLS (CHUNKED SEND ENVELOPE)
    // -----------------------------------------------------------------
    
    @objc func sendEnvelope(_ call: CAPPluginCall) {
        guard let ip = call.getString("ip"),
              let envelope = call.getObject("envelope"),
              let peripheral = discoveredPeripherals[ip] else {
            call.reject("ip and envelope are required, peripheral must be discovered")
            return
        }
        
        guard let rawData = try? JSONSerialization.data(withJSONObject: envelope, options: []) else {
            call.reject("Failed to serialize envelope")
            return
        }
        
        // Chunk envelope into fragments <= 380 bytes
        var chunks: [Data] = []
        let chunkSize = 380
        let totalCount = Int(ceil(Double(rawData.count) / Double(chunkSize)))
        
        for i in 0..<totalCount {
            let start = i * chunkSize
            let end = min(rawData.count, start + chunkSize)
            let chunkSlice = rawData.subdata(in: start..<end)
            
            var framedChunk = Data()
            framedChunk.append(UInt8(i))
            framedChunk.append(UInt8(totalCount))
            framedChunk.append(chunkSlice)
            chunks.append(framedChunk)
        }
        
        activeSends[ip] = (call: call, chunks: chunks, currentIndex: 0, writeChar: nil)
        centralManager?.connect(peripheral, options: nil)
    }
    
    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices([serviceUUID])
    }
    
    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        let uuid = peripheral.identifier.uuidString
        if let sendState = activeSends.removeValue(forKey: uuid) {
            sendState.call.reject("Connection to peer failed: \(error?.localizedDescription ?? "unknown")")
        }
    }
}

// -----------------------------------------------------------------
// GATT CLIENT CONNECTION DELEGATES
// -----------------------------------------------------------------
extension JamshNearbyPlugin: CBPeripheralDelegate {
    
    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        let uuid = peripheral.identifier.uuidString
        if let error = error {
            if let sendState = activeSends.removeValue(forKey: uuid) {
                sendState.call.reject("Service discovery failed: \(error.localizedDescription)")
                centralManager?.cancelPeripheralConnection(peripheral)
            }
            return
        }
        
        guard let service = peripheral.services?.first(where: { $0.uuid == serviceUUID }) else {
            if let sendState = activeSends.removeValue(forKey: uuid) {
                sendState.call.reject("JamSh custom BLE service not found on peer")
                centralManager?.cancelPeripheralConnection(peripheral)
            }
            return
        }
        
        peripheral.discoverCharacteristics([characteristicWriteUUID, characteristicReadUUID], for: service)
    }
    
    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        let uuid = peripheral.identifier.uuidString
        guard var sendState = activeSends[uuid] else {
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        if let error = error {
            sendState.call.reject("Characteristic discovery failed: \(error.localizedDescription)")
            activeSends.removeValue(forKey: uuid)
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        guard let writeChar = service.characteristics?.first(where: { $0.uuid == characteristicWriteUUID }) else {
            sendState.call.reject("Write characteristic missing")
            activeSends.removeValue(forKey: uuid)
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        sendState.writeChar = writeChar
        activeSends[uuid] = sendState
        
        // Write first chunk
        let firstChunk = sendState.chunks[0]
        peripheral.writeValue(firstChunk, for: writeChar, type: .withResponse)
    }
    
    public func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        let uuid = peripheral.identifier.uuidString
        guard var sendState = activeSends[uuid] else {
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        if let error = error {
            sendState.call.reject("GATT write failed: \(error.localizedDescription)")
            activeSends.removeValue(forKey: uuid)
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        let nextIndex = sendState.currentIndex + 1
        if nextIndex < sendState.chunks.count {
            sendState.currentIndex = nextIndex
            activeSends[uuid] = sendState
            let nextChunk = sendState.chunks[nextIndex]
            if let writeChar = sendState.writeChar {
                peripheral.writeValue(nextChunk, for: writeChar, type: .withResponse)
            }
        } else {
            // All chunks written! Now read ACK back
            if let readChar = characteristic.service?.characteristics?.first(where: { $0.uuid == characteristicReadUUID }) {
                peripheral.readValue(for: readChar)
            } else {
                sendState.call.reject("Read ACK characteristic not found")
                activeSends.removeValue(forKey: uuid)
                centralManager?.cancelPeripheralConnection(peripheral)
            }
        }
    }
    
    public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        let uuid = peripheral.identifier.uuidString
        defer {
            activeSends.removeValue(forKey: uuid)
            centralManager?.cancelPeripheralConnection(peripheral)
        }
        
        guard let sendState = activeSends[uuid] else { return }
        
        if let error = error {
            sendState.call.reject("Read ACK failed: \(error.localizedDescription)")
            return
        }
        
        guard let data = characteristic.value,
              let ack = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
            sendState.call.reject("Failed to parse peer response ACK")
            return
        }
        
        sendState.call.resolve(["ack": ack])
    }
}

// -----------------------------------------------------------------
// SQLITE OFFLINE GEOGRAPHIC QUEUE DATABASE
// -----------------------------------------------------------------
extension JamshNearbyPlugin {
    
    private func initDatabase() {
        let fileURL = try! FileManager.default
            .url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
            .appendingPathComponent("jamsh_offline_queue.sqlite")
        
        if sqlite3_open(fileURL.path, &db) == SQLITE_OK {
            sqlite3_exec(db, "CREATE TABLE IF NOT EXISTS message_queue (message_id TEXT PRIMARY KEY, room_id TEXT, recipient_id TEXT, envelope_json TEXT);", nil, nil, nil)
            sqlite3_exec(db, "CREATE TABLE IF NOT EXISTS ble_mesh_queue (message_id TEXT PRIMARY KEY, room_id TEXT, recipient_id TEXT, envelope_json TEXT, origin_lat REAL, origin_lng REAL, relay_radius REAL);", nil, nil, nil)
            sqlite3_exec(db, "CREATE TABLE IF NOT EXISTS seen_packets (message_id TEXT PRIMARY KEY, timestamp INTEGER);", nil, nil, nil)
        }
    }
    
    private func insertRelayMessage(messageId: String, roomId: String, recipientId: String, envelopeJson: String, lat: Double, lng: Double, radius: Double) {
        let insertQuery = "INSERT OR REPLACE INTO ble_mesh_queue (message_id, room_id, recipient_id, envelope_json, origin_lat, origin_lng, relay_radius) VALUES (?, ?, ?, ?, ?, ?, ?);"
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, insertQuery, -1, &statement, nil) == SQLITE_OK {
            sqlite3_bind_text(statement, 1, (messageId as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 2, (roomId as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 3, (recipientId as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 4, (envelopeJson as NSString).utf8String, -1, nil)
            sqlite3_bind_double(statement, 5, lat)
            sqlite3_bind_double(statement, 6, lng)
            sqlite3_bind_double(statement, 7, radius)
            sqlite3_step(statement)
        }
        sqlite3_finalize(statement)
    }
    
    private func isMessageDuplicate(_ messageId: String) -> Bool {
        let query = "SELECT 1 FROM seen_packets WHERE message_id = ?;"
        var statement: OpaquePointer?
        var exists = false
        if sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK {
            sqlite3_bind_text(statement, 1, (messageId as NSString).utf8String, -1, nil)
            if sqlite3_step(statement) == SQLITE_ROW {
                exists = true
            }
        }
        sqlite3_finalize(statement)
        return exists
    }
    
    private func markMessageSeen(_ messageId: String) {
        let insertQuery = "INSERT OR REPLACE INTO seen_packets (message_id, timestamp) VALUES (?, ?);"
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, insertQuery, -1, &statement, nil) == SQLITE_OK {
            sqlite3_bind_text(statement, 1, (messageId as NSString).utf8String, -1, nil)
            sqlite3_bind_int64(statement, 2, sqlite3_int64(Date().timeIntervalSince1970 * 1000))
            sqlite3_step(statement)
        }
        sqlite3_finalize(statement)
    }
    
    @objc func addMessageToQueue(_ call: CAPPluginCall) {
        guard let messageId = call.getString("messageId"),
              let roomId = call.getString("roomId"),
              let recipientId = call.getString("recipientId"),
              let envelope = call.getObject("envelope"),
              let envelopeData = try? JSONSerialization.data(withJSONObject: envelope, options: []),
              let envelopeJson = String(data: envelopeData, encoding: .utf8) else {
            call.reject("All parameters are required")
            return
        }
        
        let insertQuery = "INSERT OR REPLACE INTO message_queue (message_id, room_id, recipient_id, envelope_json) VALUES (?, ?, ?, ?);"
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, insertQuery, -1, &statement, nil) == SQLITE_OK {
            sqlite3_bind_text(statement, 1, (messageId as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 2, (roomId as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 3, (recipientId as NSString).utf8String, -1, nil)
            sqlite3_bind_text(statement, 4, (envelopeJson as NSString).utf8String, -1, nil)
            sqlite3_step(statement)
            call.resolve()
        } else {
            call.reject("Database insert failure")
        }
        sqlite3_finalize(statement)
    }
    
    @objc func getPendingMessages(_ call: CAPPluginCall) {
        var list: [[String: Any]] = []
        
        let query = "SELECT message_id, room_id, recipient_id, envelope_json FROM message_queue;"
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK {
            while sqlite3_step(statement) == SQLITE_ROW {
                let messageId = String(cString: sqlite3_column_text(statement, 0))
                let roomId = String(cString: sqlite3_column_text(statement, 1))
                let recipientId = String(cString: sqlite3_column_text(statement, 2))
                let envelopeJson = String(cString: sqlite3_column_text(statement, 3))
                list.append([
                    "messageId": messageId,
                    "roomId": roomId,
                    "recipientId": recipientId,
                    "envelopeJson": envelopeJson
                ])
            }
        }
        sqlite3_finalize(statement)
        
        // Append relay mesh cache
        let queryRelay = "SELECT message_id, room_id, recipient_id, envelope_json FROM ble_mesh_queue;"
        var statementRelay: OpaquePointer?
        if sqlite3_prepare_v2(db, queryRelay, -1, &statementRelay, nil) == SQLITE_OK {
            while sqlite3_step(statementRelay) == SQLITE_ROW {
                let messageId = String(cString: sqlite3_column_text(statementRelay, 0))
                let roomId = String(cString: sqlite3_column_text(statementRelay, 1))
                let recipientId = String(cString: sqlite3_column_text(statementRelay, 2))
                let envelopeJson = String(cString: sqlite3_column_text(statementRelay, 3))
                list.append([
                    "messageId": messageId,
                    "roomId": roomId,
                    "recipientId": recipientId,
                    "envelopeJson": envelopeJson,
                    "isRelay": true
                ])
            }
        }
        sqlite3_finalize(statementRelay)
        
        call.resolve(["messages": list])
    }
    
    @objc func removeMessageFromQueue(_ call: CAPPluginCall) {
        guard let messageId = call.getString("messageId") else {
            call.reject("messageId is required")
            return
        }
        
        sqlite3_exec(db, "DELETE FROM message_queue WHERE message_id = '\(messageId)';", nil, nil, nil)
        sqlite3_exec(db, "DELETE FROM ble_mesh_queue WHERE message_id = '\(messageId)';", nil, nil, nil)
        call.resolve()
    }
    
    @objc func forwardPendingRelays(_ call: CAPPluginCall) {
        // Forward pending relay messages to all currently discovered BLE peripherals
        var count = 0
        let queryRelay = "SELECT message_id, envelope_json FROM ble_mesh_queue;"
        var statementRelay: OpaquePointer?
        if sqlite3_prepare_v2(db, queryRelay, -1, &statementRelay, nil) == SQLITE_OK {
            while sqlite3_step(statementRelay) == SQLITE_ROW {
                let msgId = String(cString: sqlite3_column_text(statementRelay, 0))
                let envelopeJson = String(cString: sqlite3_column_text(statementRelay, 1))
                if let data = envelopeJson.data(using: .utf8),
                   let envelope = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
                    notifyListeners("forwardRelayToPeers", data: [
                        "messageId": msgId,
                        "envelope": envelope
                    ])
                    count += 1
                }
            }
        }
        sqlite3_finalize(statementRelay)
        call.resolve(["forwardedCount": count])
    }
}

// -----------------------------------------------------------------
// CONNECTIVITY STATUS MONITORING (PATH MONITOR)
// -----------------------------------------------------------------
extension JamshNearbyPlugin {
    
    @objc func getConnectivityStatus(_ call: CAPPluginCall) {
        call.resolve([
            "connected": isNetworkConnected,
            "type": isNetworkConnected ? "online" : "offline"
        ])
    }
    
    private func setupConnectivityListener() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            let isConnected = path.status == .satisfied
            self?.isNetworkConnected = isConnected
            self?.notifyListeners("connectivityChanged", data: [
                "connected": isConnected,
                "type": isConnected ? "online" : "offline"
            ])
        }
        pathMonitor.start(queue: networkQueue)
    }
}
