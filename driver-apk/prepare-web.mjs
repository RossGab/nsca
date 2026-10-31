import { readFile, writeFile, mkdir, copyFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { nativeDriverSource, nativeViewerSource } from './native-source.mjs';

const base = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(base);
const web = path.join(base, 'www');
await mkdir(web, { recursive: true });
const files = ['admin-dialog.js', 'storage-diagnostics.js', 'driver-health-wip.js', 'driver-camera.js', 'delivery-fields.js', 'driver-storage-viewer.html', 'admin-dark-mode.js', 'admin-dark-mode.css', 'logo.jpg', 'icon-192.png', 'icon-512.png'];
for (const file of files) await copyFile(path.join(root, file), path.join(web, file));
const vendor = path.join(web, 'vendor');
await mkdir(vendor, { recursive: true });
await cp(path.join(base, 'node_modules/leaflet/dist'), path.join(vendor, 'leaflet'), { recursive: true });
await cp(path.join(base, 'node_modules/leaflet.markercluster/dist'), path.join(vendor, 'markercluster'), { recursive: true });
await copyFile(path.join(base, 'node_modules/html5-qrcode/html5-qrcode.min.js'), path.join(vendor, 'html5-qrcode.min.js'));
let html = await readFile(path.join(root, 'driver-wip.html'), 'utf8');
html = html.replaceAll('https://unpkg.com/leaflet@1.9.4/dist/', './vendor/leaflet/')
  .replaceAll('https://unpkg.com/leaflet.markercluster@1.5.3/dist/', './vendor/markercluster/')
  .replaceAll('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js', './vendor/html5-qrcode.min.js');
const moduleMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!moduleMatch) throw new Error('Driver module not found');
let source = moduleMatch[1].replace(/https:\/\/www\.gstatic\.com\/firebasejs\/10\.7\.1\/firebase-([\w-]+)\.js/g, 'firebase/$1');
const nativeSave = `
import { registerPlugin } from '@capacitor/core';
const DriverFiles = registerPlugin('DriverFiles');
async function saveNativeFile(blob, name, automatic = false) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Unable to read export file'));
    reader.readAsDataURL(blob);
  });
  const options = { name, mime: blob.type || 'application/octet-stream', base64 };
  if (automatic) await DriverFiles.saveAutomatic(options);
  else await DriverFiles.save(options);
}
`;
const exportStart = source.indexOf('    const url = URL.createObjectURL(blob);', source.indexOf('async function downloadNextExportPart()'));
const exportEnd = source.indexOf('    await saveTasksToIndexedDB(part.tasks.map', exportStart);
if (exportStart < 0 || exportEnd < 0) throw new Error('Cannot locate export download; review native save integration');
source = source.slice(0, exportStart) + '    await saveNativeFile(blob, `tasks_export_${Date.now()}_part_${partNumber}_of_${partCount}.json`, true);\n\n' + source.slice(exportEnd);
const galleryStart = source.indexOf('function saveToGallery(blob, filename) {');
const galleryEnd = source.indexOf('\nwindow.CURRENT_TASK', galleryStart);
if (galleryStart < 0 || galleryEnd < 0) throw new Error('Cannot locate gallery download');
source = nativeSave + source.slice(0, galleryStart) + 'function saveToGallery(blob, filename) {\n  return saveNativeFile(blob, filename, true).catch(error => {\n    window.DriverStorageDiagnostics?.record("automatic_backup_failed", { error: error.message });\n    alert("Your task remains saved in the app, but its extra backup could not be saved. " + error.message);\n  });\n}\n' + source.slice(galleryEnd);
source = nativeDriverSource(source, path.join(base,'native-storage.mjs').replaceAll('\\','/'));
const settingsPrompt = /const choice = await nscaPrompt\(\s*`Settings[\s\S]*?Enter 1, 2 or 3`\s*\);/;
if (!settingsPrompt.test(source)) throw new Error('Settings action integration point missing');
source = source.replace(settingsPrompt, 'const choice = await chooseSettings();\n  if (choice === "4") { window.dispatchEvent(new Event("driver-check-updates")); return; }');
source = `import { chooseSettings } from ${JSON.stringify(path.join(base,'settings-menu.mjs').replaceAll('\\','/'))};\n` + source;
source += `
import { installPullRefresh } from ${JSON.stringify(path.join(base,'pull-refresh.mjs').replaceAll('\\','/'))};
installPullRefresh({
  canRefresh: () => !SYNC_RUNNING && !EXPORT_RUNNING && !LOAD_IN_PROGRESS && !PHOTO_CAPTURE_BUSY && !CURRENT_TASK && !Object.values(submitLock).some(Boolean),
  refresh: async () => {
    setTaskWorkLocked(true);
    try {
      saveFormCache({...loadFormCache(),...BILLING_CACHE});
      await driverPreferences.flush();
      await loadTasks();
      await checkStorageQuota();
    } finally { setTaskWorkLocked(false); applyFiltersOnly(); }
  }
});
`;
await build({ stdin: { contents: source, resolveDir: root, sourcefile: 'driver-wip-inline.js' }, nodePaths: [path.join(base, 'node_modules')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(web, 'driver-app.js') });
html = html.replace(moduleMatch[0], '<script type="module" src="./driver-app.js"></script>');
await build({ entryPoints: [path.join(base, 'update-ui.mjs')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(web, 'driver-updates.js') });
html = html.replace('</body>', '<script type="module" src="./driver-updates.js"></script>\n</body>');
// Keep the Android home screen clear of development/storage notes and floating controls.
html = html.replace(/<div role="note"[^>]*>CAMERA TEST VERSION[^<]*<\/div>/, '');
const floatingSettings = /<button id="settingsBtn"[\s\S]*?<\/button>/;
if (!floatingSettings.test(html)) throw new Error('Settings button integration point missing');
html = html.replace(floatingSettings, '');
html = html.replace('<div id="appVersion"></div>', '<header class="apk-header"><div id="appVersion"></div><button id="settingsBtn" type="button" aria-label="Open settings" aria-haspopup="dialog" title="Settings"><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 3-.7 2.2-1.7 1-2.3-.5-2.4 4.1 1.6 1.7v2L2.4 15l2.4 4.1 2.3-.5 1.7 1 .7 2.2h4.8l.7-2.2 1.7-1 2.3.5 2.4-4.1-1.6-1.6v-2l1.6-1.7L19 5.6l-2.3.5-1.7-1-.7-2.1z"/><circle cx="12" cy="12" r="3"/></svg></button></header>');
html = html.replace('</head>', `<style>
.apk-header{display:grid;grid-template-columns:minmax(0,1fr) 48px;align-items:center;gap:10px;margin-bottom:12px}
.apk-header #appVersion{min-width:0;margin:0;padding:14px;border-radius:12px;background:#172033;color:#fff;text-align:left;font-size:14px;line-height:1.5;overflow-wrap:anywhere}
.apk-header #settingsBtn{position:static;display:grid;place-items:center;width:48px;height:48px;margin:0;box-sizing:border-box;padding:0;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#172033;cursor:pointer}
.apk-header #settingsBtn:focus-visible{outline:3px solid #60a5fa;outline-offset:3px}
.apk-header #settingsBtn:disabled{opacity:.5;cursor:wait}
</style></head>`);
await writeFile(path.join(web, 'index.html'), html);
let viewer = await readFile(path.join(web, 'driver-storage-viewer.html'), 'utf8');
const viewerModule = viewer.match(/<script>([\s\S]*?)<\/script>/);
if (!viewerModule) throw new Error('Storage viewer script not found');
let viewerSource = viewerModule[1].replace('function exportDiagnosticReport()', 'async function exportDiagnosticReport()');
const reportStart = viewerSource.indexOf('      const url = URL.createObjectURL(blob);');
const reportEnd = viewerSource.indexOf('      URL.revokeObjectURL(url);', reportStart);
if (reportStart < 0 || reportEnd < 0) throw new Error('Storage report export not found');
viewerSource = nativeSave + viewerSource.slice(0, reportStart) + `
      const safeDriver = (currentDriver || 'UNKNOWN').replace(/[^a-z0-9_-]+/gi, '_');
      try {
        await saveNativeFile(blob, 'DEVICE_STORAGE_' + safeDriver + '_' + new Date().toISOString().slice(0, 10) + '.json');
      } catch (error) { alert(error.message); }
` + viewerSource.slice(reportEnd + '      URL.revokeObjectURL(url);'.length);
viewerSource = nativeViewerSource(viewerSource, path.join(base,'native-storage.mjs').replaceAll('\\','/'));
await build({ stdin: { contents: viewerSource, resolveDir: base, sourcefile: 'driver-viewer-inline.js' }, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(web, 'driver-viewer.js') });
viewer = viewer.replace(viewerModule[0], '<script type="module" src="./driver-viewer.js"></script>').replaceAll('href="driver.html"', 'href="index.html"');
await writeFile(path.join(web, 'driver-storage-viewer.html'), viewer);
// Adapt the copied health script to native disk measurements; leave the web script alone.
let health = await readFile(path.join(root,'driver-health-wip.js'),'utf8');
health = health.replace('if (storage && storage.usage / storage.quota >= 0.9) reasons.push("Site storage is above 90% of its quota.");',
  'if (storage && storage.freeBytes < 400 * 1048576) reasons.push("Device storage is low. Free space and sync completed work.");');
health = health.replace('|| !navigator.storage?.estimate)', '|| !window.DriverNativeStorage)');
health = health.replace('const value = await navigator.storage.estimate();', 'const value = await window.DriverNativeStorage.stats(); value.quota = value.usage + value.freeBytes;');
health = health.replace('"Site storage: " + mb(storage.usage) + " / " + mb(storage.quota)', '"Android app data: " + mb(storage.usage) + "; device space free: " + mb(storage.freeBytes)');
health = health.replace('Site storage: unavailable or checking.', 'Android storage: checking.');
health = health.replace('Storage is this site’s quota, not free phone space.', 'Storage shows saved Android task/photo data and available device disk space.');
health = health.replace('storage 90%', 'device space below 400 MB');
await writeFile(path.join(web,'driver-health-wip.js'),health);
console.log('Bundled full WIP driver and local libraries. Maps and server sync still require internet.');
