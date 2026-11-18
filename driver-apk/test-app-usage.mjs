import assert from 'node:assert/strict';
import { APP_USAGE_WINDOW_MS, selectDriverAppUsage, createAppUsageReporter } from '../driver-app-usage.js';

const now = Date.UTC(2026, 10, 18, 12);
const hour = 3600000;
const status = (webAge, apkAge) => ({
  latitude: 14.5, lastSeen: now,
  appUsage: {
    web: { version: 'V.R.0.0.16.1.4.40', lastSeen: now - webAge * hour },
    apk: { version: 'APK 1.0.999', lastSeen: now - apkAge * hour }
  }
});
assert.equal(APP_USAGE_WINDOW_MS, 72 * hour);
assert.deepEqual(selectDriverAppUsage(status(1, 2), now).map(row => row.app), ['web', 'apk']);
assert.deepEqual(selectDriverAppUsage(status(73, 1), now).map(row => row.app), ['apk']);
assert.deepEqual(selectDriverAppUsage(status(1, 73), now).map(row => row.app), ['web']);
assert.deepEqual(selectDriverAppUsage(status(100, 90), now).map(row => row.app), ['apk']);
assert.deepEqual(selectDriverAppUsage(status(90, 100), now).map(row => row.app), ['web']);
assert.equal(selectDriverAppUsage(status(72, 100), now)[0].recent, false);
assert.equal(selectDriverAppUsage({ lastSeen: now }, now)[0].app, 'unknown');
assert.equal(selectDriverAppUsage(null, now)[0].lastSeen, null);
assert.equal(selectDriverAppUsage({ appUsage: { web: { lastSeen: 'bad' } } }, now)[0].app, 'unknown');
assert.equal(selectDriverAppUsage({ appUsage: { apk: { lastSeen: now + hour } } }, now)[0].app, 'unknown');
assert.equal(selectDriverAppUsage({ appUsage: { web: { lastSeen: new Date(now - hour).toISOString() } } }, now)[0].app, 'web');
const bothOld = status(100, 90), preserved = JSON.stringify(bothOld);
selectDriverAppUsage(bothOld, now);
assert.equal(JSON.stringify(bothOld), preserved, 'Display policy must not delete old reports from storage');

for (const app of ['web', 'apk']) {
  let clock = now, online = false, visible = true, writes = 0, errors = 0, fail = false;
  const record = { latitude: 14.5, longitude: 121, accuracy: 10, lastSeen: now - hour, appUsage: { other: { retained: true } } };
  const reporter = createAppUsageReporter({ driverId: () => 'driver_001', app, version: 'test-version',
    now: () => clock, online: () => online, visible: () => visible,
    write: async entry => {
      writes++;
      if (fail) throw Error('permission denied');
      assert.equal(entry.app, app);
      record.appUsage[entry.app] = { version: entry.version, lastSeen: clock };
    }, reportError: () => errors++ });
  assert.equal(await reporter.report(), false);
  assert.equal(writes, 0, 'Offline mode must not enqueue misleading reports');
  online = true;
  assert.equal(await reporter.report(), true);
  assert.equal(writes, 1);
  assert.equal(await reporter.report(), false, 'Repeated foreground events are throttled');
  clock += 5 * 60 * 1000;
  visible = false;
  assert.equal(await reporter.report(), false, 'Background app must not report activity');
  visible = true; fail = true;
  assert.equal(await reporter.report(), false, 'Permission/network failure must not throw into task processing');
  assert.equal(errors, 1);
  fail = false;
  assert.equal(await reporter.report(), true, 'Failed reports can retry');
  assert.equal(record.latitude, 14.5);
  assert.equal(record.lastSeen, now - hour, 'Usage reporting must not change GPS activity time');
  assert.deepEqual(record.appUsage.other, { retained: true });
}

const handlers = new Map();
let ticks, stopped = false, writes = 0;
const host = {
  addEventListener: (event, fn) => handlers.set(event, fn), removeEventListener: event => handlers.delete(event),
  setInterval: (fn, delay) => { assert.equal(delay, 300000); ticks = fn; return 1; },
  clearInterval: () => { stopped = true; }
};
const reporter = createAppUsageReporter({ driverId: () => 'driver_001', app: 'web', version: 'test',
  online: () => true, visible: () => true, write: async () => writes++, window: host, document: host });
reporter.start(); reporter.start();
await new Promise(resolve => setImmediate(resolve));
assert.equal(writes, 1);
assert.equal(typeof handlers.get('online'), 'function');
assert.equal(typeof handlers.get('visibilitychange'), 'function');
assert.equal(typeof ticks, 'function');
reporter.stop();
assert(stopped);
assert.equal(handlers.size, 0);
console.log('PASS: web/APK reports stay separate; 72-hour rules and latest-old fallback; legacy Unknown; offline/background skip; failures isolated; GPS untouched.');
