package com.jamsh.mobile;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Bundle;
import android.os.ParcelUuid;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(
        name = "JamshNearby",
        permissions = {
                @Permission(alias = "location", strings = {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}),
                @Permission(alias = "bluetooth", strings = {Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT})
        }
)
public class JamshNearbyPlugin extends Plugin {

    private static final String TAG = "JamshNearby";
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS = "JamshSecureKeysAES";
    private static final String PREFS_NAME = "JamshSecurePrefs";

    // BLE Service and Characteristic UUIDs (Standardized mapping)
    private static final UUID SERVICE_UUID = UUID.fromString("0000fd6f-0000-1000-8000-00805f9b34fb");
    private static final UUID CHARACTERISTIC_WRITE_UUID = UUID.fromString("0000fd6f-0001-1000-8000-00805f9b34fb");
    private static final UUID CHARACTERISTIC_READ_UUID = UUID.fromString("0000fd6f-0002-1000-8000-00805f9b34fb");

    // Bluetooth Hardware Objects
    private BluetoothManager bluetoothManager;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothLeScanner scanner;
    private BluetoothGattServer gattServer;

    private boolean isAdvertising = false;
    private boolean isScanning = false;

    // Temporary ACK caching for reading nodes
    private final Map<String, String> pendingAcks = new ConcurrentHashMap<>();

    // Local DB Helper
    private QueueDbHelper dbHelper;

    // Connectivity
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    // Location
    private LocationManager locationManager;
    private double lastKnownLatitude = 0.0;
    private double lastKnownLongitude = 0.0;
    private boolean locationListenerStarted = false;


    @Override
    public void load() {
        super.load();
        dbHelper = new QueueDbHelper(getContext());
        initKeystore();
        setupConnectivityListener();
        setupLocationListener();

        bluetoothManager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        if (bluetoothManager != null) {
            bluetoothAdapter = bluetoothManager.getAdapter();
        }
    }

    // -----------------------------------------------------------------
    // SECURE STORAGE (ANDROID KEYSTORE)
    // -----------------------------------------------------------------

    private void initKeystore() {
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);
            if (!keyStore.containsAlias(KEY_ALIAS)) {
                KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);
                keyGenerator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .build());
                keyGenerator.generateKey();
            }
        } catch (Exception e) {
            Log.e(TAG, "Keystore initialization failed", e);
        }
    }

    private SecretKey getSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);
        return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
    }

    @PluginMethod
    public void saveSecure(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("Key and Value must not be null");
            return;
        }
        try {
            SecretKey secretKey = getSecretKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey);
            byte[] iv = cipher.getIV();
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));

            String encryptedBase64 = Base64.encodeToString(encrypted, Base64.DEFAULT);
            String ivBase64 = Base64.encodeToString(iv, Base64.DEFAULT);

            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                    .putString(key + "_data", encryptedBase64)
                    .putString(key + "_iv", ivBase64)
                    .apply();

            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to save secure value", e);
            call.reject("Encryption failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getSecure(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("Key must not be null");
            return;
        }
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String encryptedBase64 = prefs.getString(key + "_data", null);
            String ivBase64 = prefs.getString(key + "_iv", null);

            if (encryptedBase64 == null || ivBase64 == null) {
                call.resolve(new JSObject());
                return;
            }

            byte[] encrypted = Base64.decode(encryptedBase64, Base64.DEFAULT);
            byte[] iv = Base64.decode(ivBase64, Base64.DEFAULT);

            SecretKey secretKey = getSecretKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(128, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, spec);
            byte[] decrypted = cipher.doFinal(encrypted);

            JSObject ret = new JSObject();
            ret.put("value", new String(decrypted, StandardCharsets.UTF_8));
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to get secure value", e);
            call.reject("Decryption failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void removeSecure(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("Key must not be null");
            return;
        }
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .remove(key + "_data")
                .remove(key + "_iv")
                .apply();
        call.resolve();
    }

    // -----------------------------------------------------------------
    // LOCATION GEOGRAPHIC ENFORCEMENT
    // -----------------------------------------------------------------

    @SuppressLint("MissingPermission")
    private void setupLocationListener() {
        if (locationListenerStarted) return;

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            if (getContext().checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                getContext().checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                Log.w(TAG, "Location permissions not granted yet");
                return;
            }
        }

        locationManager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return;

        try {
            Location lastKnown = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (lastKnown == null) {
                lastKnown = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            }
            if (lastKnown != null) {
                lastKnownLatitude = lastKnown.getLatitude();
                lastKnownLongitude = lastKnown.getLongitude();
            }

            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10000, 10, new LocationListener() {
                @Override
                public void onLocationChanged(Location location) {
                    if (location != null) {
                        lastKnownLatitude = location.getLatitude();
                        lastKnownLongitude = location.getLongitude();
                    }
                }
                @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
                @Override public void onProviderEnabled(String provider) {}
                @Override public void onProviderDisabled(String provider) {}
            });
            locationListenerStarted = true;
        } catch (Exception e) {
            Log.w(TAG, "Failed to initialize location updates", e);
        }
    }

    @PluginMethod
    public void getCurrentLocation(PluginCall call) {
        setupLocationListener();
        JSObject coords = new JSObject();
        coords.put("latitude", lastKnownLatitude);
        coords.put("longitude", lastKnownLongitude);
        call.resolve(coords);
    }

    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371e3; // meters
        double phi1 = Math.toRadians(lat1);
        double phi2 = Math.toRadians(lat2);
        double deltaPhi = Math.toRadians(lat2 - lat1);
        double deltaLambda = Math.toRadians(lon2 - lon1);

        double a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                Math.cos(phi1) * Math.cos(phi2) *
                        Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // in meters
    }

    // -----------------------------------------------------------------
    // HYBRID BLUETOOTH LE ENGINE
    // -----------------------------------------------------------------

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void startAdvertising(PluginCall call) {
        setupLocationListener();
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth is disabled or not available");
            return;
        }

        String discoveryId = call.getString("discoveryId");
        if (discoveryId == null) {
            call.reject("discoveryId is required");
            return;
        }

        stopAdvertisingInternal();

        advertiser = bluetoothAdapter.getBluetoothLeAdvertiser();
        if (advertiser == null) {
            call.reject("BLE advertising is not supported on this device");
            return;
        }

        // Include Internet Availability Flag in custom discovery token payload
        boolean isOnline = isNetworkAvailable();
        String activeDiscoveryPayload = discoveryId + "|" + (isOnline ? "1" : "0");

        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .build();

        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .addServiceUuid(new ParcelUuid(SERVICE_UUID))
                // Attach custom payload string to manufacture space or service data safely
                .addServiceData(new ParcelUuid(SERVICE_UUID), activeDiscoveryPayload.getBytes(StandardCharsets.UTF_8))
                .build();

        try {
            advertiser.startAdvertising(settings, data, advertiseCallback);
            isAdvertising = true;
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to start advertising: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopAdvertising(PluginCall call) {
        stopAdvertisingInternal();
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void stopAdvertisingInternal() {
        isAdvertising = false;
        if (advertiser != null && advertiseCallback != null) {
            try {
                advertiser.stopAdvertising(advertiseCallback);
            } catch (Exception ignored) {}
            advertiser = null;
        }
    }

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settingsInEffect) {
            super.onStartSuccess(settingsInEffect);
            Log.d(TAG, "[Nearby] BLE Advertise success");
        }

        @Override
        public void onStartFailure(int errorCode) {
            super.onStartFailure(errorCode);
            Log.e(TAG, "[Nearby] BLE Advertise failed with code: " + errorCode);
        }
    };

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void startScanning(PluginCall call) {
        setupLocationListener();
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth is disabled or not available");
            return;
        }

        stopScanningInternal();

        scanner = bluetoothAdapter.getBluetoothLeScanner();
        if (scanner == null) {
            call.reject("BLE Scanner not available");
            return;
        }

        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build();

        List<ScanFilter> filters = new ArrayList<>();
        filters.add(new ScanFilter.Builder()
                .setServiceUuid(new ParcelUuid(SERVICE_UUID))
                .build());

        try {
            scanner.startScan(filters, settings, scanCallback);
            isScanning = true;
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to start BLE scanning: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopScanning(PluginCall call) {
        stopScanningInternal();
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void stopScanningInternal() {
        isScanning = false;
        if (scanner != null && scanCallback != null) {
            try {
                scanner.stopScan(scanCallback);
            } catch (Exception ignored) {}
            scanner = null;
        }
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            super.onScanResult(callbackType, result);
            if (result == null || result.getScanRecord() == null) return;

            byte[] serviceData = result.getScanRecord().getServiceData(new ParcelUuid(SERVICE_UUID));
            if (serviceData == null) return;

            String payload = new String(serviceData, StandardCharsets.UTF_8);
            String mac = result.getDevice().getAddress();

            // Extract discovery tokens and internet status flag
            String discoveryId = payload;
            boolean peerIsOnline = false;
            if (payload.contains("|")) {
                String[] parts = payload.split("\\|");
                discoveryId = parts[0];
                peerIsOnline = "1".equals(parts[1]);
            }

            JSObject peer = new JSObject();
            peer.put("discoveryId", discoveryId);
            peer.put("ip", mac); // Use MAC address as peer connection endpoint
            peer.put("isOnline", peerIsOnline);

            JSObject ret = new JSObject();
            ret.put("peer", peer);
            notifyListeners("peerDiscovered", ret);
        }
    };

    // -----------------------------------------------------------------
    // GATT SERVER (RECEIVING ROLE)
    // -----------------------------------------------------------------

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void startServer(PluginCall call) {
        if (bluetoothManager == null) {
            call.reject("BluetoothManager is not available");
            return;
        }

        stopServerInternal();

        try {
            gattServer = bluetoothManager.openGattServer(getContext(), gattServerCallback);
            if (gattServer == null) {
                call.reject("Failed to open GATT Server");
                return;
            }

            BluetoothGattService service = new BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY);

            BluetoothGattCharacteristic writeChar = new BluetoothGattCharacteristic(
                    CHARACTERISTIC_WRITE_UUID,
                    BluetoothGattCharacteristic.PROPERTY_WRITE,
                    BluetoothGattCharacteristic.PERMISSION_WRITE
            );

            BluetoothGattCharacteristic readChar = new BluetoothGattCharacteristic(
                    CHARACTERISTIC_READ_UUID,
                    BluetoothGattCharacteristic.PROPERTY_READ,
                    BluetoothGattCharacteristic.PERMISSION_READ
            );

            service.addCharacteristic(writeChar);
            service.addCharacteristic(readChar);
            gattServer.addService(service);

            call.resolve();
        } catch (Exception e) {
            call.reject("GATT server startup failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        stopServerInternal();
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void stopServerInternal() {
        if (gattServer != null) {
            try {
                gattServer.close();
            } catch (Exception ignored) {}
            gattServer = null;
        }
    }

    private final BluetoothGattServerCallback gattServerCallback = new BluetoothGattServerCallback() {
        @SuppressLint("MissingPermission")
        @Override
        public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId, BluetoothGattCharacteristic characteristic, boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
            super.onCharacteristicWriteRequest(device, requestId, characteristic, preparedWrite, responseNeeded, offset, value);

            if (characteristic.getUuid().equals(CHARACTERISTIC_WRITE_UUID) && value != null) {
                try {
                    String envelopeJson = new String(value, StandardCharsets.UTF_8);
                    JSObject envelope = new JSObject(envelopeJson);

                    String msgId = envelope.getString("id");
                    double originLat = envelope.optDouble("origin_lat", 0.0);
                    double originLng = envelope.optDouble("origin_lng", 0.0);
                    double relayRadius = envelope.optDouble("relay_radius", 5000.0); // 5km default
                    String roomId = envelope.getString("room_id");
                    String recipientId = envelope.getString("recipient_id");

                    // 1. Seen Packets & Duplicate Suppression
                    if (dbHelper.isMessageDuplicate(msgId)) {
                        Log.d(TAG, "[BLE Relay] Duplicate packet " + msgId + " ignored.");
                        if (responseNeeded) {
                            gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null);
                        }
                        return;
                    }
                    dbHelper.markMessageSeen(msgId);

                    // 2. Geofence Boundary Enforcement
                    double dist = calculateDistance(lastKnownLatitude, lastKnownLongitude, originLat, originLng);
                    if (dist > relayRadius) {
                        Log.w(TAG, "[BLE Relay] Node outside geofence zone: " + dist + "m > " + relayRadius + "m limit. Discarding.");
                        if (responseNeeded) {
                            gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null);
                        }
                        return;
                    }

                    // 3. Target Routing Decisions
                    SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    String myUserId = prefs.getString("user_id", "");

                    if (recipientId != null && recipientId.equals(myUserId)) {
                        // Received at target destination
                        JSObject ret = new JSObject();
                        ret.put("connectionId", device.getAddress()); // Store MAC for virtual link tracking
                        ret.put("envelope", envelope);
                        notifyListeners("messageReceived", ret);
                    } else {
                        // Not the recipient -> cache to local SQLite queue for carry-forward mesh routing
                        dbHelper.insertRelayMessage(msgId, roomId, recipientId, envelopeJson, originLat, originLng, relayRadius);
                        Log.d(TAG, "[BLE Relay] Packet " + msgId + " cached in local mesh queue.");

                        // Offline -> Online Relay: trigger upload immediately if active internet is available
                        if (isNetworkAvailable()) {
                            triggerRelayUpload(msgId, roomId, recipientId, envelope);
                        }
                    }

                    // 4. Cache ACK response for read request
                    JSObject ack = new JSObject();
                    ack.put("protocol_version", "1.0");
                    ack.put("message_id", msgId);
                    ack.put("ack_status", "SUCCESS");
                    ack.put("signature", "sig_mesh_verified");

                    pendingAcks.put(device.getAddress(), ack.toString());

                    if (responseNeeded) {
                        gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "[GATT Server] Characteristic write handling failed", e);
                    if (responseNeeded) {
                        gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null);
                    }
                }
            }
        }

        @SuppressLint("MissingPermission")
        @Override
        public void onCharacteristicReadRequest(BluetoothDevice device, int requestId, int offset, BluetoothGattCharacteristic characteristic) {
            super.onCharacteristicReadRequest(device, requestId, offset, characteristic);
            if (characteristic.getUuid().equals(CHARACTERISTIC_READ_UUID)) {
                String ack = pendingAcks.remove(device.getAddress());
                if (ack == null) {
                    ack = new JSObject().toString();
                }
                gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, ack.getBytes(StandardCharsets.UTF_8));
            }
        }
    };

    private void triggerRelayUpload(String msgId, String roomId, String recipientId, JSObject envelope) {
        JSObject ret = new JSObject();
        ret.put("messageId", msgId);
        ret.put("roomId", roomId);
        ret.put("recipientId", recipientId);
        ret.put("envelope", envelope);
        notifyListeners("relayUploadTrigger", ret);
    }

    @PluginMethod
    public void respondToEnvelope(PluginCall call) {
        // Kept as a clean interface stub because direct BLE responses are handled natively via write ACKs
        call.resolve();
    }

    // -----------------------------------------------------------------
    // GATT CLIENT (SENDING ROLE)
    // -----------------------------------------------------------------

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void sendEnvelope(PluginCall call) {
        String ip = call.getString("ip"); // Bluetooth Device MAC Address
        JSObject envelope = call.getObject("envelope");

        if (ip == null || envelope == null) {
            call.reject("ip and envelope are required");
            return;
        }

        if (bluetoothAdapter == null) {
            call.reject("Bluetooth adapter is not available");
            return;
        }

        BluetoothDevice device = bluetoothAdapter.getRemoteDevice(ip);
        if (device == null) {
            call.reject("Device not found for address: " + ip);
            return;
        }

        new Thread(() -> {
            device.connectGatt(getContext(), false, new BluetoothGattCallback() {
                private boolean resolved = false;

                @Override
                public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                    super.onConnectionStateChange(gatt, status, newState);
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        gatt.requestMtu(512); // Request larger MTU to fit envelope payload comfortably
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        gatt.close();
                        if (!resolved) {
                            resolved = true;
                            getActivity().runOnUiThread(() -> call.reject("Disconnection during envelope routing"));
                        }
                    }
                }

                @Override
                public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
                    super.onMtuChanged(gatt, mtu, status);
                    if (status == BluetoothGatt.GATT_SUCCESS) {
                        gatt.discoverServices();
                    } else {
                        gatt.close();
                        if (!resolved) {
                            resolved = true;
                            getActivity().runOnUiThread(() -> call.reject("Failed to configure connection MTU"));
                        }
                    }
                }

                @Override
                public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                    super.onServicesDiscovered(gatt, status);
                    if (status == BluetoothGatt.GATT_SUCCESS) {
                        BluetoothGattService service = gatt.getService(SERVICE_UUID);
                        if (service != null) {
                            BluetoothGattCharacteristic charac = service.getCharacteristic(CHARACTERISTIC_WRITE_UUID);
                            if (charac != null) {
                                byte[] payload = envelope.toString().getBytes(StandardCharsets.UTF_8);
                                charac.setValue(payload);
                                gatt.writeCharacteristic(charac);
                                return;
                            }
                        }
                    }
                    gatt.close();
                    if (!resolved) {
                        resolved = true;
                        getActivity().runOnUiThread(() -> call.reject("JamSh custom services not found on peer"));
                    }
                }

                @Override
                public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
                    super.onCharacteristicWrite(gatt, characteristic, status);
                    if (status == BluetoothGatt.GATT_SUCCESS) {
                        // After write completes, read ACK back
                        BluetoothGattService service = gatt.getService(SERVICE_UUID);
                        if (service != null) {
                            BluetoothGattCharacteristic readChar = service.getCharacteristic(CHARACTERISTIC_READ_UUID);
                            if (readChar != null) {
                                gatt.readCharacteristic(readChar);
                                return;
                            }
                        }
                    }
                    gatt.close();
                    if (!resolved) {
                        resolved = true;
                        getActivity().runOnUiThread(() -> call.reject("GATT Write operation failed"));
                    }
                }

                @Override
                public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
                    super.onCharacteristicRead(gatt, characteristic, status);
                    gatt.close();
                    if (resolved) return;
                    resolved = true;

                    if (status == BluetoothGatt.GATT_SUCCESS && characteristic.getValue() != null) {
                        try {
                            String response = new String(characteristic.getValue(), StandardCharsets.UTF_8);
                            JSObject ack = new JSObject(response);

                            JSObject ret = new JSObject();
                            ret.put("ack", ack);

                            getActivity().runOnUiThread(() -> call.resolve(ret));
                        } catch (Exception e) {
                            getActivity().runOnUiThread(() -> call.reject("Failed to parse peer response ACK: " + e.getMessage()));
                        }
                    } else {
                        getActivity().runOnUiThread(() -> call.reject("GATT Read validation failed"));
                    }
                }
            });
        }).start();
    }

    // -----------------------------------------------------------------
    // SQLITE GEOGRAPHIC QUEUE DATABASE METHODS
    // -----------------------------------------------------------------

    @PluginMethod
    public void addMessageToQueue(PluginCall call) {
        String messageId = call.getString("messageId");
        String roomId = call.getString("roomId");
        String recipientId = call.getString("recipientId");
        JSObject envelope = call.getObject("envelope");

        if (messageId == null || roomId == null || recipientId == null || envelope == null) {
            call.reject("All parameters are required");
            return;
        }

        try {
            dbHelper.insertMessage(messageId, roomId, recipientId, envelope.toString());
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to queue message: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getPendingMessages(PluginCall call) {
        try {
            JSArray arr = dbHelper.getPendingMessages();
            JSObject ret = new JSObject();
            ret.put("messages", arr);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to fetch pending messages: " + e.getMessage());
        }
    }

    @PluginMethod
    public void removeMessageFromQueue(PluginCall call) {
        String messageId = call.getString("messageId");
        if (messageId == null) {
            call.reject("messageId is required");
            return;
        }
        try {
            dbHelper.deleteMessage(messageId);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to delete message from queue: " + e.getMessage());
        }
    }

    // -----------------------------------------------------------------
    // CONNECTIVITY STATUS MONITORING
    // -----------------------------------------------------------------

    @PluginMethod
    public void getConnectivityStatus(PluginCall call) {
        JSObject ret = new JSObject();
        boolean connected = isNetworkAvailable();
        ret.put("connected", connected);
        ret.put("type", connected ? "online" : "offline");
        call.resolve(ret);
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network network = cm.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities actNw = cm.getNetworkCapabilities(network);
        return actNw != null && (actNw.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                actNw.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                actNw.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));
    }

    private void setupConnectivityListener() {
        connectivityManager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;

        NetworkRequest networkRequest = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                super.onAvailable(network);
                triggerConnectivityChange(true);
            }

            @Override
            public void onLost(Network network) {
                super.onLost(network);
                triggerConnectivityChange(false);
            }
        };

        connectivityManager.registerNetworkCallback(networkRequest, networkCallback);
    }

    private void triggerConnectivityChange(boolean connected) {
        JSObject ret = new JSObject();
        ret.put("connected", connected);
        ret.put("type", connected ? "online" : "offline");
        notifyListeners("connectivityChanged", ret);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        stopAdvertisingInternal();
        stopScanningInternal();
        stopServerInternal();
        if (connectivityManager != null && networkCallback != null) {
            connectivityManager.unregisterNetworkCallback(networkCallback);
        }
    }

    // -----------------------------------------------------------------
    // SQLITE GEOGRAPHY OPEN HELPER
    // -----------------------------------------------------------------

    private static class QueueDbHelper extends SQLiteOpenHelper {
        private static final String DATABASE_NAME = "jamsh_offline_queue.db";
        private static final int DATABASE_VERSION = 2; // Upgraded schema version

        private static final String TABLE_QUEUE = "message_queue";
        private static final String TABLE_RELAY_QUEUE = "ble_mesh_queue";
        private static final String TABLE_SEEN_PACKETS = "seen_packets";

        private static final String COL_MSG_ID = "message_id";
        private static final String COL_ROOM_ID = "room_id";
        private static final String COL_RECIPIENT_ID = "recipient_id";
        private static final String COL_ENVELOPE = "envelope_json";

        // Geofence fields
        private static final String COL_LAT = "origin_lat";
        private static final String COL_LNG = "origin_lng";
        private static final String COL_RADIUS = "relay_radius";

        public QueueDbHelper(Context context) {
            super(context, DATABASE_NAME, null, DATABASE_VERSION);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE " + TABLE_QUEUE + " (" +
                    COL_MSG_ID + " TEXT PRIMARY KEY, " +
                    COL_ROOM_ID + " TEXT, " +
                    COL_RECIPIENT_ID + " TEXT, " +
                    COL_ENVELOPE + " TEXT)");

            db.execSQL("CREATE TABLE " + TABLE_RELAY_QUEUE + " (" +
                    COL_MSG_ID + " TEXT PRIMARY KEY, " +
                    COL_ROOM_ID + " TEXT, " +
                    COL_RECIPIENT_ID + " TEXT, " +
                    COL_ENVELOPE + " TEXT, " +
                    COL_LAT + " REAL, " +
                    COL_LNG + " REAL, " +
                    COL_RADIUS + " REAL)");

            db.execSQL("CREATE TABLE " + TABLE_SEEN_PACKETS + " (" +
                    COL_MSG_ID + " TEXT PRIMARY KEY, " +
                    "timestamp INTEGER)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            if (oldVersion < 2) {
                db.execSQL("DROP TABLE IF EXISTS " + TABLE_RELAY_QUEUE);
                db.execSQL("DROP TABLE IF EXISTS " + TABLE_SEEN_PACKETS);
                db.execSQL("CREATE TABLE " + TABLE_RELAY_QUEUE + " (" +
                        COL_MSG_ID + " TEXT PRIMARY KEY, " +
                        COL_ROOM_ID + " TEXT, " +
                        COL_RECIPIENT_ID + " TEXT, " +
                        COL_ENVELOPE + " TEXT, " +
                        COL_LAT + " REAL, " +
                        COL_LNG + " REAL, " +
                        COL_RADIUS + " REAL)");

                db.execSQL("CREATE TABLE " + TABLE_SEEN_PACKETS + " (" +
                        COL_MSG_ID + " TEXT PRIMARY KEY, " +
                        "timestamp INTEGER)");
            }
        }

        public void insertMessage(String messageId, String roomId, String recipientId, String envelopeJson) {
            SQLiteDatabase db = this.getWritableDatabase();
            db.execSQL("INSERT OR REPLACE INTO " + TABLE_QUEUE + " (" +
                            COL_MSG_ID + ", " +
                            COL_ROOM_ID + ", " +
                            COL_RECIPIENT_ID + ", " +
                            COL_ENVELOPE + ") VALUES (?, ?, ?, ?)",
                    new Object[]{messageId, roomId, recipientId, envelopeJson});
        }

        public void insertRelayMessage(String messageId, String roomId, String recipientId, String envelopeJson, double lat, double lng, double radius) {
            SQLiteDatabase db = this.getWritableDatabase();
            db.execSQL("INSERT OR REPLACE INTO " + TABLE_RELAY_QUEUE + " (" +
                            COL_MSG_ID + ", " +
                            COL_ROOM_ID + ", " +
                            COL_RECIPIENT_ID + ", " +
                            COL_ENVELOPE + ", " +
                            COL_LAT + ", " +
                            COL_LNG + ", " +
                            COL_RADIUS + ") VALUES (?, ?, ?, ?, ?, ?, ?)",
                    new Object[]{messageId, roomId, recipientId, envelopeJson, lat, lng, radius});
        }

        public void deleteMessage(String messageId) {
            SQLiteDatabase db = this.getWritableDatabase();
            db.execSQL("DELETE FROM " + TABLE_QUEUE + " WHERE " + COL_MSG_ID + " = ?", new Object[]{messageId});
            db.execSQL("DELETE FROM " + TABLE_RELAY_QUEUE + " WHERE " + COL_MSG_ID + " = ?", new Object[]{messageId});
        }

        public boolean isMessageDuplicate(String messageId) {
            SQLiteDatabase db = this.getReadableDatabase();
            Cursor cursor = db.rawQuery("SELECT 1 FROM " + TABLE_SEEN_PACKETS + " WHERE " + COL_MSG_ID + " = ?", new String[]{messageId});
            boolean exists = cursor.getCount() > 0;
            cursor.close();
            return exists;
        }

        public void markMessageSeen(String messageId) {
            SQLiteDatabase db = this.getWritableDatabase();
            db.execSQL("INSERT OR REPLACE INTO " + TABLE_SEEN_PACKETS + " (" + COL_MSG_ID + ", timestamp) VALUES (?, ?)",
                    new Object[]{messageId, System.currentTimeMillis()});
        }

        public JSArray getPendingMessages() throws Exception {
            JSArray arr = new JSArray();
            SQLiteDatabase db = this.getReadableDatabase();
            Cursor cursor = db.rawQuery("SELECT * FROM " + TABLE_QUEUE, null);
            if (cursor.moveToFirst()) {
                do {
                    JSObject obj = new JSObject();
                    obj.put("messageId", cursor.getString(cursor.getColumnIndexOrThrow(COL_MSG_ID)));
                    obj.put("roomId", cursor.getString(cursor.getColumnIndexOrThrow(COL_ROOM_ID)));
                    obj.put("recipientId", cursor.getString(cursor.getColumnIndexOrThrow(COL_RECIPIENT_ID)));
                    obj.put("envelopeJson", cursor.getString(cursor.getColumnIndexOrThrow(COL_ENVELOPE)));
                    arr.put(obj);
                } while (cursor.moveToNext());
            }
            cursor.close();

            // Append messages in the relay mesh cache as well
            Cursor cursorRelay = db.rawQuery("SELECT * FROM " + TABLE_RELAY_QUEUE, null);
            if (cursorRelay.moveToFirst()) {
                do {
                    JSObject obj = new JSObject();
                    obj.put("messageId", cursorRelay.getString(cursorRelay.getColumnIndexOrThrow(COL_MSG_ID)));
                    obj.put("roomId", cursorRelay.getString(cursorRelay.getColumnIndexOrThrow(COL_ROOM_ID)));
                    obj.put("recipientId", cursorRelay.getString(cursorRelay.getColumnIndexOrThrow(COL_RECIPIENT_ID)));
                    obj.put("envelopeJson", cursorRelay.getString(cursorRelay.getColumnIndexOrThrow(COL_ENVELOPE)));
                    obj.put("isRelay", true);
                    arr.put(obj);
                } while (cursorRelay.moveToNext());
            }
            cursorRelay.close();

            return arr;
        }
    }
}
