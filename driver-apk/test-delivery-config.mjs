import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createDeliveryConfigLoader } from '../driver-delivery-config.js';

const methods = { Delivered: { _order: ['code'], fields: { code: { type: 'text', required: true } } } };
const config = { updatedAt: 'v1', deliveryMethods: methods };
function fixture({ saved = {}, online = true, fetch = async () => config, storageError = false, flushError = false, timeoutMs = 30 } = {}) {
  let value = JSON.stringify(saved), calls = 0;
  const storage = {
    getItem: () => value,
    setItem: (_, next) => { if (storageError) throw Error('quota'); value = next; },
    flush: async () => { if (flushError) throw Error('native write failed'); }
  };
  const loader = createDeliveryConfigLoader({ storage, online: () => online, timeoutMs,
    fetchConfig: async name => { calls++; return fetch(name); }, fetchJobTypes: async () => ({}) });
  return { loader, storage, saved: () => JSON.parse(value), calls: () => calls };
}

// Persisted configurations survive reopening the app without internet.
let f = fixture();
assert.deepEqual((await f.loader.load('RECON CRS', { requirePersisted: true })).methods, methods);
const reopened = fixture({ saved: f.saved(), online: false });
assert.deepEqual((await reopened.loader.load('RECON CRS')).methods, methods);
assert.equal(reopened.calls(), 0);

// A misleading online flag or hung request must still use a good saved copy.
for (const fetch of [async () => { throw Error('network'); }, () => new Promise(() => {})]) {
  f = fixture({ saved: { 'RECON CRS': config }, fetch });
  assert.deepEqual((await f.loader.load('RECON CRS')).methods, methods);
  assert.equal(f.calls(), 1);
}

// Missing/empty configuration is visible as a failure, not permanently cached.
let available = false;
f = fixture({ fetch: async () => available ? config : null });
await assert.rejects(f.loader.load('RECON CRS'), /No delivery options/);
available = true;
assert.deepEqual((await f.loader.load('RECON CRS', { force: true })).methods, methods);
assert.equal(f.calls(), 2);
f = fixture({ online: false });
await assert.rejects(f.loader.load('RECON CRS'), /Connect to the internet/);

// An empty server response must not destroy a previous offline configuration.
f = fixture({ saved: { 'RECON CRS': config }, fetch: async () => ({ deliveryMethods: {} }) });
assert.deepEqual((await f.loader.load('RECON CRS', { force: true })).methods, methods);
assert.deepEqual(f.saved()['RECON CRS'], config);

// Concurrent task renders share a request; different types retain both saved entries.
f = fixture();
await Promise.all([f.loader.load('RECON CRS'), f.loader.load('RECON CRS')]);
assert.equal(f.calls(), 1);
f = fixture();
await Promise.all([f.loader.load('RECON CRS'), f.loader.load('NODRES')]);
assert.deepEqual(Object.keys(f.saved()).sort(), ['NODRES', 'RECON CRS']);

// Existing caches and harmless job-type spacing/case differences are supported.
f = fixture({ saved: { 'Recon CRS': config }, online: false });
assert.deepEqual((await f.loader.load(' RECON   CRS ')).methods, methods);
f = fixture({ saved: { 'Recon CRS': config } });
await f.loader.load('RECON CRS', { force: true });
assert.deepEqual(Object.keys(f.saved()), ['RECON CRS']);
assert.deepEqual((await fixture({ saved: f.saved(), online: false }).loader.load('Recon CRS')).methods, methods);
const aliasLoader = createDeliveryConfigLoader({ storage: fixture().storage,
  fetchConfig: async () => null, fetchJobTypes: async () => ({ 'Recon CRS': config }), online: () => true });
assert.deepEqual((await aliasLoader.load('RECON CRS')).methods, methods);

// Upgrade regression: legacy duplicate aliases must not block rendering or Retry.
const otherConfig = { deliveryMethods: { Returned: { fields: {} } } };
for (const online of [false, true]) {
  f = fixture({ online, saved: { NOD: config, 'NOD ': otherConfig } });
  assert.deepEqual((await f.loader.load('NOD')).methods, methods);
}
f = fixture({ saved: { NOD: { deliveryMethods: {} }, 'NOD ': config }, online: false });
assert.deepEqual((await f.loader.load('NOD')).methods, methods);
f = fixture({ saved: { 'Nod ': config, nod: config }, online: false });
assert.deepEqual((await f.loader.load('NOD')).methods, methods);
f = fixture({ saved: { 'Nod ': config, nod: otherConfig } });
assert.deepEqual((await f.loader.load('NOD', { force: true })).methods, methods);
assert.equal(f.calls(), 1, 'Conflicting cache must not prevent contacting server');
assert.deepEqual(Object.keys(f.saved()), ['NOD'], 'Successful refresh repairs cached aliases');
f = fixture({ saved: { 'Nod ': config, nod: otherConfig }, online: false });
await assert.rejects(f.loader.load('NOD'), /Connect to the internet/);

// Failed persistence must not be reported as ready for offline work (web or native).
for (const failure of [{ storageError: true }, { flushError: true }]) {
  f = fixture(failure);
  await assert.rejects(f.loader.load('RECON CRS', { force: true, requirePersisted: true }), /could not be saved/);
  assert.deepEqual((await f.loader.load('RECON CRS')).methods, methods);
}

// Corrupt local JSON can recover online; missing job types must fail explicitly.
f = fixture(); f.storage.getItem = () => '{bad json';
assert.deepEqual((await f.loader.load('RECON CRS')).methods, methods);
await assert.rejects(f.loader.load(''), /no job type/);

// Reopening online refreshes an old saved configuration.
const updated = { deliveryMethods: { Returned: { fields: {} } } };
f = fixture({ saved: { 'RECON CRS': config }, fetch: async () => updated });
assert.deepEqual((await f.loader.load('RECON CRS')).methods, updated.deliveryMethods);

// Exercise the actual download handlers: incomplete config must not acknowledge tasks.
for (const file of ['driver.html', 'driver-wip.html']) {
  const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
  const download = source.slice(source.indexOf('async function downloadTasksForDriver()'),
    source.indexOf('async function markTasksAsDownloaded('));
  const preloadStart = source.indexOf('async function preloadDriverUIConfig(');
  const preload = source.slice(preloadStart, source.indexOf('initializeOfflineStorageProtection();', preloadStart));
  for (const ready of [false, true]) {
    const events = [], alerts = [];
    const context = {
      console: { log() {}, error() {} }, navigator: { onLine: true },
      IS_DOWNLOADING: false, DRIVER_ID: 'driver_001', FORCE_REDOWNLOAD: false,
      dateFilter: { value: '2026-11-18' }, document: { getElementById: () => null },
      storageDiagnostic: { record() {} }, showMessage() {}, alert: text => alerts.push(text),
      getTasksFromIndexedDB: async () => [],
      loadDriverTasksFromFirestore: async () => [{ _key: 'one', JOBTYPE: 'RECON CRS' }],
      loadDriverUI: async (_, options) => {
        assert.equal(options.requirePersisted, true);
        events.push('config');
        if (!ready) throw Error('configuration missing');
        return methods;
      },
      saveTasksToIndexedDB: async () => events.push('save'),
      markTasksAsDownloaded: async () => events.push('mark'),
      loadTasks: async () => {}, updateTasksForDownloadCount: async () => {}
    };
    vm.createContext(context);
    vm.runInContext(preload + download, context);
    await context.downloadTasksForDriver();
    assert.deepEqual(events, ready ? ['config', 'save', 'mark'] : ['config']);
    assert.equal(context.IS_DOWNLOADING, false);
    assert.equal(alerts.length, ready ? 0 : 1);
  }
}
console.log('PASS: delivery config offline/reopen, network fallback/timeout, empty-response recovery, concurrent cache writes, job-type aliases, persistence failures, and refresh.');
console.log('PASS: web and WIP downloads verify persisted configuration before saving/acknowledging tasks; failure leaves server tasks available for retry.');
