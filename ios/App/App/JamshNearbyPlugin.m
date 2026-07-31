#import <Capacitor/Capacitor.h>

CAP_PLUGIN(JamshNearbyPlugin, "JamshNearby",
           CAP_PLUGIN_METHOD(saveSecure, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getSecure, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(removeSecure, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(startAdvertising, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stopAdvertising, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(startScanning, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stopScanning, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(startServer, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stopServer, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(respondToEnvelope, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(sendEnvelope, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(addMessageToQueue, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getPendingMessages, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(removeMessageFromQueue, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getConnectivityStatus, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getCurrentLocation, CAPPluginReturnPromise);
)
