import { readFile, writeFile, mkdir, copyFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

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
async function saveNativeFile(blob, name) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Unable to read export file'));
    reader.readAsDataURL(blob);
  });
  await DriverFiles.save({ name, mime: blob.type || 'application/octet-stream', base64 });
}
`;
const exportStart = source.indexOf('    const url = URL.createObjectURL(blob);', source.indexOf('async function downloadNextExportPart()'));
const exportEnd = source.indexOf('    await saveTasksToIndexedDB(part.tasks.map', exportStart);
if (exportStart < 0 || exportEnd < 0) throw new Error('Cannot locate export download; review native save integration');
source = source.slice(0, exportStart) + '    await saveNativeFile(blob, `tasks_export_${Date.now()}_part_${partNumber}_of_${partCount}.json`);\n\n' + source.slice(exportEnd);
const galleryStart = source.indexOf('function saveToGallery(blob, filename) {');
const galleryEnd = source.indexOf('\nwindow.CURRENT_TASK', galleryStart);
if (galleryStart < 0 || galleryEnd < 0) throw new Error('Cannot locate gallery download');
source = nativeSave + source.slice(0, galleryStart) + 'function saveToGallery(blob, filename) {\n  return saveNativeFile(blob, filename).catch(error => alert(error.message));\n}\n' + source.slice(galleryEnd);
await build({ stdin: { contents: source, resolveDir: root, sourcefile: 'driver-wip-inline.js' }, nodePaths: [path.join(base, 'node_modules')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(web, 'driver-app.js') });
html = html.replace(moduleMatch[0], '<script type="module" src="./driver-app.js"></script>');
html = html.replace('CAMERA TEST VERSION', 'ANDROID TEST VERSION');
html = html.replace('Uses the same driver data as the live app.', 'Separate device storage; connects to the live task system.');
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
await build({ stdin: { contents: viewerSource, resolveDir: base, sourcefile: 'driver-viewer-inline.js' }, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(web, 'driver-viewer.js') });
viewer = viewer.replace(viewerModule[0], '<script type="module" src="./driver-viewer.js"></script>').replaceAll('href="driver.html"', 'href="index.html"');
await writeFile(path.join(web, 'driver-storage-viewer.html'), viewer);
console.log('Bundled full WIP driver and local libraries. Maps and server sync still require internet.');
