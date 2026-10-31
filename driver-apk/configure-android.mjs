import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('./android/app/src/main/AndroidManifest.xml', import.meta.url);
let xml = await readFile(file, 'utf8');
for (const permission of ['CAMERA', 'ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION']) {
  if (!xml.includes('android.permission.' + permission)) xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.' + permission + '" />\n</manifest>');
}
if (!xml.includes('android.hardware.camera')) xml = xml.replace('</manifest>', '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>');
await writeFile(file, xml);
