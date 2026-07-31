# JamSh Monorepo

JamSh is a hybrid End-to-End Encrypted (E2EE) messaging and social media application built for Web, Android, and iOS. It uses Supabase for global online real-time database syncing, and a custom native transport layer for offline nearby messaging over local Wi-Fi networks and hotspots.

---

## Workspace Layout

- `apps/web`: React Native Web app built using Vite and Tailwind. Acts as the core client.
- `apps/mobile`: Expo mobile client placeholder.
- `apps/api-server`: Backend gateway.
- `apps/testing-e2e`: Playwright E2E integration test suite.
- `packages/api`: Supabase API and offline Transport Router services.
- `packages/encryption`: Pairwise X25519 Diffie-Hellman / AES-GCM logic.
- `packages/shared`: Validation schemas, common formatting helpers.
- `packages/types`: Core TypeScript interfaces.
- `packages/ui`: Shared theme design system and UI components.

---

## Native Offline Transport Integration

The app uses a custom Capacitor plugin `JamshNearby` configured natively under:
- **Android**: `android/app/src/main/java/com/jamsh/mobile/JamshNearbyPlugin.java`
- **iOS**: `ios/App/App/JamshNearbyPlugin.swift`

### 1. Android Configuration
Verify `android/app/src/main/AndroidManifest.xml` has the following permissions:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
```

### 2. iOS Configuration
Ensure the iOS native project includes target keys in `Info.plist`:
```xml
<key>NSLocalNetworkUsageDescription</key>
<string>JamSh uses the local network to find and exchange E2EE messages with nearby users.</string>
<key>NSBonjourServices</key>
<array>
    <string>_jamsh-nearby._tcp</string>
    <string>_jamsh-nearby._udp</string>
</array>
```

---

## Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile packages:
   ```bash
   npm run build
   ```

3. Run the web client locally:
   ```bash
   npm run dev --workspace @jamsh/web
   ```

4. Build and sync to Capacitor Android:
   ```bash
   npm run cap:sync
   ```

---

## Verification & Testing

### 1. End-to-End Tests
To run Playwright integration tests (verifying online E2EE flow and offline queue resync):
```bash
# Make sure the dev server is running on http://localhost:5173
npx playwright test
```

### 2. Physical Devices Offline P2P Tests
See details in [docs/OFFLINE_MESSAGING_ARCHITECTURE.md](docs/OFFLINE_MESSAGING_ARCHITECTURE.md).
