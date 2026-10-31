# APK-only native storage

Only `driver-apk/` and its build workflow implement this migration. `driver.html`, `driver-wip.html`, service workers, manifests and installed PWAs are unchanged. `native-source.mjs` replaces database calls only in the generated Android bundle.

## Data

- Tasks and Driver ID/form/UI preferences: private `driver-native.sqlite` database.
- Photo metadata and SHA-256: SQLite; image bytes: immutable files in the app's private `driver-photos` directory.
- Task completion, download, sync, cleanup, exports, and storage viewer all use this native backend after migration.
- Presentation settings and diagnostic logs may still use WebView localStorage. They are not the task/photo database.

## First launch after updating

The app blocks task actions while it copies its own existing WebView data. It reads one photo at a time, checks copied task data and preferences, compares photo metadata and SHA-256, verifies record counts and SQLite integrity, then records a migration-complete marker. Future launches use native data directly, including if the old browser database is unavailable.

The original IndexedDB and preferences are not deleted or rewritten during the copy. If any read, write, or verification fails, the app displays a retry message and does not activate partially migrated data. It does not silently fall back to an empty task list. On retry, only incomplete native staging records are reset; resetting a completed migration is rejected.

This migrates data **inside the existing APK installation** only. It cannot access a separate Chrome/PWA installation's storage. Install over the existing Driver WIP APK with the same signing key. Do not uninstall. Do not downgrade to an older web-storage APK after migration; it would read the old retained snapshot instead of subsequent native work.

## Storage health

The obsolete browser-persistence banner is removed from the APK bundle. Low device space and native database/file failures still produce warnings. The APK health panel reads native task/photo data size and available device disk space.

Clearing Android app data or uninstalling removes native records and app-private photo files. Native storage does not guarantee protection from all OS/device failures; sync completed work regularly. Automatic recovery copies and manual exports retain their separate existing Android save locations.

## Validation

`npm test` checks generated integration paths and migration success, verification failure, interrupted retry, settings/photo preservation, empty installs, and idempotence. `android/gradlew :app:testDebugUnitTest` runs Robolectric SQLite tests for persistence across reopen, transaction rollback, photo replacement/checksums, submission flags, safe cleanup, and missing-file detection.

Before wider distribution, install the update over an APK containing downloaded tasks, an unfinished photo, a completed unsynced task, and form data. Check counts and IDs before/after; restart offline; then test capture, submit, both sync options, storage viewer, and file export. Desktop tests do not verify actual phone WebView migration or hardware behavior.
