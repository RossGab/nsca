import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
const read = file => readFile(new URL(file, import.meta.url), 'utf8');
const html = await read('www/index.html');
assert(!html.includes('https://unpkg.com/'), 'CDN scripts must be bundled');
assert(!html.includes('serviceWorker.register'), 'APK must not register the production service worker');
assert(html.includes('ANDROID TEST VERSION'));
assert(html.includes('src="./driver-updates.js"'));
assert((await read('www/driver-updates.js')).includes('Download update'));
for (const match of html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g)) {
  await access(new URL('www/' + match[1], import.meta.url));
}
const app = await read('www/driver-app.js');
assert(!app.includes('https://www.gstatic.com/firebasejs/10.7.1/'), 'Firebase must be bundled');
assert(app.includes('DriverFiles.save'));
const start = app.indexOf('async function downloadNextExportPart()');
const save = app.indexOf('await saveNativeFile(blob,', start);
const mark = app.indexOf('await saveTasksToIndexedDB(part.tasks.map', start);
assert(start >= 0 && save > start && mark > save, 'Export must await file save before marking tasks');
assert((await read('www/driver-storage-viewer.html')).includes('href="index.html"'));
const manifest = await read('android/app/src/main/AndroidManifest.xml');
for (const name of ['CAMERA', 'ACCESS_FINE_LOCATION', 'INTERNET']) assert(manifest.includes('android.permission.' + name));
console.log('PASS: bundled dependencies, local asset references, no PWA worker, native export ordering, viewer navigation, Android permissions.');
