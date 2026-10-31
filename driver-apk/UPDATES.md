# GitHub APK updates

## One-time setup before pushing

The original APK is signed with this computer's Android debug key. Its private backup is in `.signing/driver-wip.keystore`. This directory is ignored by Git. Do not generate a replacement key, commit it, or add it to a GitHub Release.

The existing key has already been preserved locally using `node prepare-signing.mjs`. That command also creates `.signing/github-secret.txt`, containing the base64 value for the GitHub Actions secret. This is private signing material, not an APK or public asset.

1. Open <https://github.com/RossGab/nsca/settings/secrets/actions>.
2. Choose **New repository secret**.
3. Name: **DRIVER_WIP_KEYSTORE_BASE64**.
4. Open `driver-apk/.signing/github-secret.txt` locally and paste its entire contents into the secret value. Save it. Do not paste it into issues, release notes, or chat.
5. Push the code to `main`.

If you already pushed before adding the secret, open **Actions → Driver WIP APK**, select the failed run, and choose **Re-run all jobs**. You can also choose **Run workflow** on the main branch.

The repository and release assets must be public for drivers to check/download without signing in. No GitHub token is embedded in the app.

## What happens after pushing

`.github/workflows/driver-wip-apk.yml` runs for changes to the APK project, WIP driver HTML, bundled scripts, and assets. It builds and signs an APK using the saved key, validates the web bundle and update policy, then publishes a GitHub Release containing:

- `driver-wip.apk`
- `driver-update.json` (version code, display version, APK URL, SHA-256)

Release tag: `driver-wip-v<versionCode>`. GitHub builds add the workflow run number to the base version code in `version.json`, so they are newer than the current local build. Never lower that base or reset the workflow counter after distribution. Rerunning an already published build does not overwrite its release; push a new driver change or start a new workflow run for the next version.

Release page: <https://github.com/RossGab/nsca/releases/latest>

Direct APK: <https://github.com/RossGab/nsca/releases/latest/download/driver-wip.apk>

This uses the repository's **latest** release. Keep it assigned to the newest Driver WIP release, not an unrelated release.

## First update on the phone

The first APK (version code 1) does not contain an updater. Install the newly built local `dist/driver-wip.apk` (version code 2), or the first GitHub Release APK, **over the existing installation** once. Do not uninstall; uninstalling removes its local data. The new APK must be signed with the original key. Build verification compares the signing certificate locally.

## Later updates

On launch the app checks GitHub automatically. After returning to the app it checks again if six hours have passed. The update section stays hidden while checking, when no newer version is available, or when a check fails without a previously discovered update. A newer version reveals the section with **Download update** and **Check for updates**. The download button opens the public APK in the phone's browser. Save it, open it from Downloads, allow installation from that source if Android asks, and approve the update.

This is an update notification and download flow, not silent installation. Drivers can continue working offline if the update check fails. It does not modify task storage. Same or older versions are not offered. Download links are restricted to Driver WIP APK assets in RossGab/nsca.

Production `driver.html`, the PWA service worker, and installed PWAs are not updated by this workflow. APK changes come from `driver-wip.html` and the bundled dependencies. Editing only production `driver.html` does not change this test APK.

## Local rebuilds

Use Node 22+, Java 21, and Android SDK 36 / build tools 35.0.0. Set `JAVA_HOME` and `ANDROID_HOME`, then run:

```powershell
cd driver-apk
npm ci
npm run android:sync
npm test
npm run apk
```

Update `version.json` for local builds. Once a GitHub APK has been installed, local builds need a higher `versionCode` than that installed build. GitHub sets the version through `DRIVER_VERSION_CODE` / `DRIVER_VERSION_NAME` instead.

This retains the original test signing identity for compatibility. Keep the key safe and use this channel for testing; production signing and Play Store distribution need a separate planned setup.
