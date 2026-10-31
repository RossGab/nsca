export const repository = 'RossGab/nsca';
export function availableUpdate(manifest, installedCode) {
  if (!Number.isSafeInteger(installedCode) || installedCode < 1) return null;
  if (!manifest || manifest.appId !== 'com.nsca.driver.wip' || !Number.isSafeInteger(manifest.versionCode) || manifest.versionCode <= installedCode || manifest.versionCode > 2100000000) return null;
  if (typeof manifest.versionName !== 'string' || manifest.versionName.length > 60) return null;
  let url;
  try { url = new URL(manifest.apkUrl); } catch (_) { return null; }
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash || !/^\/RossGab\/nsca\/releases\/download\/driver-wip-v[0-9]+\/driver-wip\.apk$/.test(url.pathname)) return null;
  return { versionCode: manifest.versionCode, versionName: manifest.versionName, apkUrl: url.href };
}
