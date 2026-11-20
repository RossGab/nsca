import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createDeliveryConfigLoader, checkDeliveryReadiness, createDeliveryReadinessController } from '../driver-delivery-config.js';

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

// Readiness must not trust a previous memory-only flag if saved settings disappear.
f = fixture({ saved: { NOD: config }, online: false });
await f.loader.load('NOD');
f.storage.setItem('driverUIConfigCache', '{}');
await assert.rejects(f.loader.load('NOD', { requirePersisted: true }), /Connect to the internet/);

// A large route is checked by job type, not by asking drivers to inspect every task.
const jobTypes = ['AD', 'NOD', 'NODRES', 'DWOL CRS', 'DWOLRES', 'NOV CRS'];
const route = Array.from({ length: 501 }, (_, index) => ({
  _key: String(index), JOBTYPE: jobTypes[index % jobTypes.length], driverId: 'one', status: 'PENDING',
  note: 'Keep this entry', photos: ['saved-photo']
}));
const untouchedRoute = JSON.stringify(route);
let checks = 0;
let readiness = await checkDeliveryReadiness(route, async (_, options) => {
  checks++; assert.equal(options.requirePersisted, true); return methods;
});
assert.equal(readiness.ready, true);
assert.equal(checks, 6);
assert.equal(readiness.taskCount, 501);
readiness = await checkDeliveryReadiness(route, async type => {
  if (type === 'NOD') throw Error('settings missing');
  return methods;
});
assert.equal(readiness.ready, false);
assert.equal(readiness.failures[0].jobType, 'NOD');
assert.equal(readiness.failures[0].taskKeys.length, route.filter(task => task.JOBTYPE === 'NOD').length);
assert.equal(JSON.stringify(route), untouchedRoute);

// Automatic readiness reports failure before work, then repairs old tasks on recheck.
const elements = Object.fromEntries(['deliveryReadinessBanner', 'deliveryReadinessText', 'deliveryReadinessRetry', 'deliveryReadinessOkay'].map(id => [id, {
  hidden: true, dataset: {}, textContent: '', addEventListener(event, handler) { this[event] = handler; }, scrollIntoView() {}
}]));
let missing = true, restored = 0, notices = 0;
const controller = createDeliveryReadinessController({
  document: { getElementById: id => elements[id] }, getTasks: async () => route,
  loadConfig: async type => { if (missing && type === 'NOD') throw Error('missing'); return methods; },
  isActionable: task => task.driverId === 'one' && task.status === 'PENDING', isBusy: () => false,
  renderAvailable: () => restored++, notify: () => notices++, online: () => false
});
assert.equal((await controller.check()).ready, false);
assert.equal(elements.deliveryReadinessBanner.dataset.state, 'blocked');
assert.equal(elements.deliveryReadinessRetry.hidden, false);
assert.equal(elements.deliveryReadinessOkay.hidden, true);
elements.deliveryReadinessOkay.click();
assert.equal(elements.deliveryReadinessBanner.hidden, false, 'Warnings cannot be dismissed');
assert.equal(await controller.ensure('1'), false);
assert.equal(notices, 1);
missing = false;
assert.equal((await controller.check()).ready, true);
assert.equal(elements.deliveryReadinessBanner.dataset.state, 'ready');
assert.equal(elements.deliveryReadinessRetry.hidden, true);
assert.equal(elements.deliveryReadinessOkay.hidden, false);
elements.deliveryReadinessOkay.click();
assert.equal(elements.deliveryReadinessBanner.hidden, true);
await controller.check();
assert.equal(elements.deliveryReadinessBanner.hidden, true, 'Same ready route stays dismissed');
missing = true;
await controller.check();
assert.equal(elements.deliveryReadinessBanner.hidden, false, 'A new failure reappears');
missing = false;
await controller.check();
assert.equal(elements.deliveryReadinessBanner.hidden, false, 'Recovered status can be acknowledged again');
assert.equal(await controller.ensure('1'), true);
assert(restored > 0);
assert.equal(JSON.stringify(route), untouchedRoute);
controller.dispose();

// Exercise the actual download handlers: incomplete config must not acknowledge tasks.
for (const file of ['driver.html', 'driver-wip.html']) {
  const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
  // A blocked task must not launch the camera or release existing photo previews.
  const photoStart = source.indexOf('\nwindow.startPhoto = async function') + 1;
  const photoEnd = source.indexOf('cameraInput.oncancel =', photoStart);
  const photoContext = { window: {}, PHOTO_CAPTURE_STARTING: false, PHOTO_CAPTURE_BUSY: false, CURRENT_TASK: null, SYNC_RUNNING: false,
    setPhotoProgress() {},
    ensureTaskDeliveryReady: async () => false, releasePhotoPreviews: () => assert.fail('Must not touch photos before readiness') };
  vm.createContext(photoContext);
  vm.runInContext(source.slice(photoStart, photoEnd), photoContext);
  await photoContext.window.startPhoto(1, 'not-ready');
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
console.log('PASS: automatic 501-task readiness checks six job types; missing settings block capture; recovery preserves existing photos/entries; evicted settings cannot appear ready.');
