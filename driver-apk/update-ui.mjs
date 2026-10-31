import { registerPlugin } from '@capacitor/core';
import { availableUpdate } from './update-policy.mjs';
const updater = registerPlugin('DriverUpdates');
const section = document.createElement('section');
section.hidden = true;
section.style.cssText = 'background:#fff;color:#172033;border:1px solid #ccc;padding:12px;border-radius:8px;margin:8px 0';
section.setAttribute('aria-label', 'App updates');
section.innerHTML = '<div data-update-status role="status">Checking for app updates…</div><button type="button" data-check style="margin-top:8px;min-height:44px">Check for updates</button> <button type="button" data-download hidden style="margin-top:8px;min-height:44px">Download update</button><p data-update-help hidden>Save the APK, then open it from Downloads and approve the update. Keep this app installed to retain saved tasks. Finish saving any photo before updating.</p>';
const mount = document.getElementById('appHealthMount');
if (mount) mount.after(section); else document.body.prepend(section);
const status = section.querySelector('[data-update-status]');
const check = section.querySelector('[data-check]');
const download = section.querySelector('[data-download]');
let latest = null, busy = false, lastCheck = 0;
async function checkUpdates(manual = false) {
  if (busy || document.hidden || (!manual && Date.now() - lastCheck < 21600000)) return;
  busy = true;
  check.disabled = true;
  try {
    const result = await updater.check();
    if (result.published && (result.manifest?.appId !== 'com.nsca.driver.wip' || !Number.isSafeInteger(result.manifest?.versionCode))) throw new Error('Invalid update information');
    latest = availableUpdate(result.manifest, result.installedCode);
    section.hidden = !latest;
    status.textContent = latest ? 'Update available: ' + latest.versionName : '';
    download.hidden = !latest;
    section.querySelector('[data-update-help]').hidden = !latest;
    lastCheck = Date.now();
  } catch (_) {
    // Keep checks silent; retain an already discovered update if offline.
    section.hidden = !latest;
  } finally { busy = false; check.disabled = false; }
}
check.onclick = () => checkUpdates(true);
download.onclick = async () => {
  if (!latest) return;
  try { await updater.openDownload({ url: latest.apkUrl }); }
  catch (_) { status.textContent = 'Could not open the download. Please try again.'; }
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdates(); });
setTimeout(() => checkUpdates(), 1500);
