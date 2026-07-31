import Foundation
import Capacitor
import CoreBluetooth
import CoreLocation
import SQLite3

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
        
        // Initialize managers
        centralManager = CBCentralManager(delegate: self, queue: nil)
        peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
        
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
        print("[Nearby] Central Manager status updated to: \(central.state.rawValue)")
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
        
        let isOnline = pathMonitor.currentPath.status == .satisfied
        let activeDiscoveryPayload = "\(discoveryId)|\(isOnline ? "1" : "0")"
        
        if let payloadData = activeDiscoveryPayload.data(using: .utf8) {
            isAdvertising = true
            peripheralManager?.startAdvertising([
                CBAdvertisementDataServiceUUIDsKey: [serviceUUID],
                CBAdvertisementDataLocalNameKey: activeDiscoveryPayload
            ])
            call.resolve()
        } else {
            call.reject("Failed to encode payload")
        }
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
        centralManager?.scanForPeripherals(withServices: [serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
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
        if name.isEmpty { return }
        
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
    // GATT SERVER CALLBACKS (RECEIVE & AKNOWLEDGEMENT HANDLING)
    // -----------------------------------------------------------------
    
    public func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            if request.characteristic.uuid == characteristicWriteUUID, let data = request.value {
                do {
                    guard let envelope = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
                          let msgId = envelope["id"] as? String,
                          let originLat = envelope["origin_lat"] as? Double,
                          let originLng = envelope["origin_lng"] as? Double,
                          let roomId = envelope["room_id"] as? String,
                          let recipientId = envelope["recipient_id"] as? String else {
                        peripheral.respond(to: request, withResult: .invalidAttributeValueLength)
                        return
                    }
                    
                    let relayRadius = envelope["relay_radius"] as? Double ?? 5000.0
                    let envelopeJson = String(data: data, encoding: .utf8) ?? ""
                    
                    // 1. Duplicate Packet Suppression
                    if isMessageDuplicate(msgId) {
                        peripheral.respond(to: request, withResult: .success)
                        return
                    }
                    markMessageSeen(msgId)
                    
                    // 2. Geofence Boundary Enforcement
                    let dist = calculateDistance(lat1: lastKnownLatitude, lon1: lastKnownLongitude, lat2: originLat, lon2: originLng)
                    if dist > relayRadius {
                        peripheral.respond(to: request, withResult: .success)
                        return
                    }
                    
                    // 3. Routing Decisions
                    let defaults = UserDefaults.standard
                    let myUserId = defaults.string(forKey: "user_id") ?? ""
                    
                    if recipientId == myUserId {
                        notifyListeners("messageReceived", data: [
                            "connectionId": request.central.identifier.uuidString,
                            "envelope": envelope
                        ])
                    } else {
                        // Carry-Forward Relay Cache inside SQLite
                        insertRelayMessage(messageId: msgId, roomId: roomId, recipientId: recipientId, envelopeJson: envelopeJson, lat: originLat, lng: originLng, radius: relayRadius)
                        
                        if pathMonitor.currentPath.status == .satisfied {
                            notifyListeners("relayUploadTrigger", data: [
                                "messageId": msgId,
                                "roomId": roomId,
                                "recipientId": recipientId,
                                "envelope": envelope
                            ])
                        }
                    }
                    
                    // Cache ACK response
                    let ack: [String: Any] = [
                        "protocol_version": "1.0",
                        "message_id": msgId,
                        "ack_status": "SUCCESS",
                        "signature": "sig_mesh_verified"
                    ]
                    if let ackData = try? JSONSerialization.data(withJSONObject: ack, options: []), let ackStr = String(data: ackData, encoding: .utf8) {
                        pendingAcks[request.central.identifier.uuidString] = ackStr
                    }
                    
                    peripheral.respond(to: request, withResult: .success)
                } catch {
                    peripheral.respond(to: request, withResult: .unlikelyError)
                }
            } else {
                peripheral.respond(to: request, withResult: .requestNotSupported)
            }
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
        call.resolve()
    }
    
    // -----------------------------------------------------------------
    // GATT CLIENT CALLS (SEND ENVELOPE IMPLEMENTATION)
    // -----------------------------------------------------------------
    
    @objc func sendEnvelope(_ call: CAPPluginCall) {
        guard let ip = call.getString("ip"), // UUID string of peripheral
              let envelope = call.getObject("envelope") else {
            call.reject("ip and envelope are required")
            return
        }
        
        guard let peripheral = discoveredPeripherals[ip] else {
            call.reject("Peripheral device not found: \(ip)")
            return
        }
        
        pendingSendCalls[ip] = call
        centralManager?.connect(peripheral, options: nil)
    }
    
    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices([serviceUUID])
    }
    
    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        let uuid = peripheral.identifier.uuidString
        if let call = pendingSendCalls.removeValue(forKey: uuid) {
            call.reject("Failed to connect to peripheral: \(error?.localizedDescription ?? "unknown")")
        }
    }
}

// -----------------------------------------------------------------
// GATT CLIENT CONNECTION DELEGATES
// -----------------------------------------------------------------
extension JamshNearbyPlugin: CBPeripheralDelegate {
    
    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            let uuid = peripheral.identifier.uuidString
            if let call = pendingSendCalls.removeValue(forKey: uuid) {
                call.reject("Service discovery failed: \(error.localizedDescription)")
                centralManager?.cancelPeripheralConnection(peripheral)
            }
            return
        }
        
        guard let service = peripheral.services?.first(where: { $0.uuid == serviceUUID }) else {
            let uuid = peripheral.identifier.uuidString
            if let call = pendingSendCalls.removeValue(forKey: uuid) {
                call.reject("JamSh custom BLE service not found")
                centralManager?.cancelPeripheralConnection(peripheral)
            }
            return
        }
        
        peripheral.discoverCharacteristics([characteristicWriteUUID, characteristicReadUUID], for: service)
    }
    
    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        let uuid = peripheral.identifier.uuidString
        guard let call = pendingSendCalls[uuid] else {
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        if let error = error {
            call.reject("Characteristics discovery failed: \(error.localizedDescription)")
            pendingSendCalls.removeValue(forKey: uuid)
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        guard let writeChar = service.characteristics?.first(where: { $0.uuid == characteristicWriteUUID }),
              let envelope = call.getObject("envelope"),
              let data = try? JSONSerialization.data(withJSONObject: envelope, options: []) else {
            call.reject("Write characteristic or envelope not found")
            pendingSendCalls.removeValue(forKey: uuid)
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        // Write envelope
        peripheral.writeValue(data, for: writeChar, type: .withResponse)
    }
    
    public func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        let uuid = peripheral.identifier.uuidString
        guard let call = pendingSendCalls[uuid] else {
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        if let error = error {
            call.reject("Write envelope value failed: \(error.localizedDescription)")
            pendingSendCalls.removeValue(forKey: uuid)
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        guard let readChar = characteristic.service?.characteristics?.first(where: { $0.uuid == characteristicReadUUID }) else {
            call.reject("Read characteristic not found")
            pendingSendCalls.removeValue(forKey: uuid)
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        // Read ACK back
        peripheral.readValue(for: readChar)
    }
    
    public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        let uuid = peripheral.identifier.uuidString
        defer {
            pendingSendCalls.removeValue(forKey: uuid)
            centralManager?.cancelPeripheralConnection(peripheral)
        }
        
        guard let call = pendingSendCalls[uuid] else { return }
        
        if let error = error {
            call.reject("Read ACK value failed: \(error.localizedDescription)")
            return
        }
        
        guard let data = characteristic.value,
              let ack = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
            call.reject("Failed to parse ACK envelope data")
            return
        }
        
        call.resolve(["ack": ack])
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
        
        // Fetch original pending outgoing queue
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
        
        // Fetch relay queue
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
}

// -----------------------------------------------------------------
// CONNECTIVITY STATUS MONITORING (PATH MONITOR)
// -----------------------------------------------------------------
extension JamshNearbyPlugin {
    
    @objc func getConnectivityStatus(_ call: CAPPluginCall) {
        let isConnected = pathMonitor.currentPath.status == .satisfied
        call.resolve([
            "connected": isConnected,
            "type": isConnected ? "online" : "offline"
        ])
    }
    
    private func setupConnectivityListener() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            let isConnected = path.status == .satisfied
            self?.notifyListeners("connectivityChanged", data: [
                "connected": isConnected,
                "type": isConnected ? "online" : "offline"
            ])
        }
        pathMonitor.start(queue: queue)
    }
}
