# Android setup

This mobile app is an Expo-generated native Android project, not a Capacitor app.

Use these entry points:

- Open `apps/mobile/android` in Android Studio.
- Run `npm run mobile:android` from the repo root for a debug build on a connected device or emulator.
- Run `npm run mobile:android:debug` to produce a debug APK.
- Run `npm run mobile:android:release` to produce a release APK.

Do not use `npx cap sync android` here unless the project is explicitly converted to Capacitor.