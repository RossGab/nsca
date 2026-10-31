# Driver WIP Android test app

This packages the full `../driver-wip.html` interface as a separate Capacitor Android application (`com.nsca.driver.wip`). Production web pages are not modified.

The APK has separate local storage from the installed PWA. Enter the Driver ID again. It connects to the existing live Firebase backend: downloads, completions, and sync affect real tasks. Sync pending work in the PWA before switching; this project does not migrate its data.

## Rebuild

Install Node 22+, Java 21, and the Android SDK (platform 36 and build tools 35.0.0). Configure `JAVA_HOME` and `ANDROID_HOME`.

From this directory:

```powershell
npm ci
npm run android:sync
npm run apk
```

Output: `dist/driver-wip.apk`. This is a signed **debug test APK**, not a Play Store release. Future test updates need the same signing key to preserve installed app data; Android's debug keystore is machine-specific. Keep it private and use a dedicated release key before distributing production updates.

`npm run android:init` is only for initial Android project generation. The generated Android project, including the custom file-saving plugin, is included; do not delete and regenerate it without preserving that plugin.

## Included

- Driver WIP screen, GPS tracking, task download/completion/sync, IndexedDB task/photo storage, camera preview, health indicator, and storage viewer.
- Bundled Firebase JavaScript, map libraries, QR scanner, images, and local scripts so startup does not depend on CDN libraries.
- Android camera and location permission requests via Capacitor's WebView integration.
- Native file-save picker for JSON exports and photo downloads. An export part is marked exported only after Android confirms a successful write. Canceling the picker rejects the export.

Maps need network access for map tiles, and Firebase operations require network access. Downloaded tasks/photos remain local for offline work. Background GPS and background sync are not implemented as Android services; do not assume they continue after leaving the app.

## Phone acceptance checks

1. Install and launch; verify Driver WIP name, enter a test Driver ID online.
2. Grant precise location and camera; test denial and retry as well.
3. Download tasks, go offline, reopen the app, capture all photo slots, and complete a test task.
4. Reconnect and confirm synchronization against the admin view.
5. Export a JSON part; cancel once and verify it stays unexported, then save and inspect the file.
6. Open storage viewer and return; test photo downloads, scanner, external map links, rotation, and app resume.

Desktop compilation does not verify these phone behaviors or prove that the earlier PWA crash is fixed.
