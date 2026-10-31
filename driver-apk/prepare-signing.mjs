// Preserve the key used by the first test APK. Never print or commit its contents.
import { copyFile, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
const directory = new URL('./.signing/', import.meta.url);
await mkdir(directory, { recursive: true });
const key = new URL('driver-wip.keystore', directory);
try { await access(key); }
catch (_) { await copyFile(path.join(homedir(), '.android', 'debug.keystore'), key); }
await writeFile(new URL('github-secret.txt', directory), (await readFile(key)).toString('base64'));
console.log('Preserved existing signing key. GitHub secret value saved privately in driver-apk/.signing/github-secret.txt.');
