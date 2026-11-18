export const APP_USAGE_WINDOW_MS = 72 * 60 * 60 * 1000;

function reportTime(value) {
  const time = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(time) && time > 0 ? time : null;
}

// Keep recent app reports separately. If both are old, keep only the latest one.
export function selectDriverAppUsage(status = {}, now = Date.now()) {
  const rows = ['web', 'apk'].flatMap(app => {
    const entry = status?.appUsage?.[app];
    const lastSeen = reportTime(entry?.lastSeen);
    if (!lastSeen || lastSeen > now + 5 * 60 * 1000) return [];
    return [{ app, version: typeof entry.version === 'string' ? entry.version : 'Unknown', lastSeen,
      recent: now - lastSeen < APP_USAGE_WINDOW_MS }];
  }).sort((a, b) => b.lastSeen - a.lastSeen);
  const recent = rows.filter(row => row.recent);
  if (recent.length) return recent;
  if (rows.length) return [rows[0]];
  return [{ app: 'unknown', version: 'Unknown', lastSeen: reportTime(status?.lastSeen), recent: false }];
}

// Reporting is independent of GPS, tasks and uploads, and never throws to callers.
export function createAppUsageReporter({ driverId, app, version, write, reportError = () => {},
  online = () => navigator.onLine, visible = () => !document.hidden, now = () => Date.now(),
  window: hostWindow = globalThis.window, document: hostDocument = globalThis.document }) {
  let lastSuccess = null, pending = null, timer = null, started = false;
  async function report() {
    if (!online() || !visible()) return false;
    if (pending) return pending;
    if (lastSuccess !== null && now() - lastSuccess < 60000) return false;
    const id = String(driverId() || '').trim();
    if (!id || !['web', 'apk'].includes(app)) return false;
    const work = (async () => {
      try {
        await write({ driverId: id, app, version });
        lastSuccess = now();
        return true;
      } catch (error) {
        try { reportError(error); } catch {}
        return false;
      }
    })();
    pending = work;
    try { return await work; }
    finally { if (pending === work) pending = null; }
  }
  const onActive = () => { void report(); };
  function start() {
    if (started) return;
    started = true;
    hostWindow.addEventListener('online', onActive);
    hostWindow.addEventListener('pageshow', onActive);
    hostDocument.addEventListener('visibilitychange', onActive);
    timer = hostWindow.setInterval(onActive, 5 * 60 * 1000);
    onActive();
  }
  function stop() {
    if (!started) return;
    started = false;
    hostWindow.clearInterval(timer);
    hostWindow.removeEventListener('online', onActive);
    hostWindow.removeEventListener('pageshow', onActive);
    hostDocument.removeEventListener('visibilitychange', onActive);
  }
  return { report, start, stop };
}
