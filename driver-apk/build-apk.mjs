import { spawnSync } from 'node:child_process';
import { mkdir, copyFile } from 'node:fs/promises';
const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'cmd.exe' : './gradlew', windows ? ['/d', '/c', 'gradlew.bat assembleDebug'] : ['assembleDebug'], { cwd: new URL('./android/', import.meta.url), stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await copyFile(new URL('./android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url), new URL('./dist/driver-wip.apk', import.meta.url));
console.log('Created driver-apk/dist/driver-wip.apk (debug test build)');
