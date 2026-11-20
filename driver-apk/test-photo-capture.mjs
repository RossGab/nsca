import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
for (const file of ['driver.html', 'driver-wip.html']) {
  const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
  const start = source.indexOf('\nwindow.startPhoto = async function') + 1;
  const fn = source.slice(start, source.indexOf('cameraInput.oncancel =', start));
  function fixture() {
    const counts = { checks: 0, camera: 0, previews: 0, saved: 0, fallback: 0, alerts: 0 };
    const context = {
      PHOTO_CAPTURE_STARTING: false, PHOTO_CAPTURE_BUSY: false, CURRENT_TASK: null, CURRENT_PHOTO_INDEX: null, SYNC_RUNNING: false,
      ensureTaskDeliveryReady: async () => { counts.checks++; return true; },
      releasePhotoPreviews: () => counts.previews++, taskList: { querySelectorAll: () => [] },
      localStorage: { setItem() {} }, CAPTURE_RECOVERY_KEY: 'test', VERSION: 'test',
      storageDiagnostic: { record() {}, flush() {} }, clearCaptureRecovery() {}, applyFiltersOnly() {},
      setPhotoProgress() {}, alert: () => counts.alerts++,
      window: { captureDriverPhoto: async () => { counts.camera++; return null; } },
      processCapturedPhoto: async () => { counts.saved++; context.CURRENT_TASK = context.CURRENT_PHOTO_INDEX = null; }
    };
    context.cameraInput = { value: '', click: () => counts.fallback++,
      oncancel: () => { context.CURRENT_TASK = context.CURRENT_PHOTO_INDEX = null; } };
    vm.createContext(context); vm.runInContext(fn, context);
    return { context, counts, capture: () => context.window.startPhoto(1, 'task-one') };
  }

  // The reported regression: four taps during a slow readiness check must open one camera.
  let f = fixture(); const ready = deferred(), camera = deferred(), processing = deferred();
  f.context.ensureTaskDeliveryReady = async () => { f.counts.checks++; return ready.promise; };
  f.context.window.captureDriverPhoto = async () => { f.counts.camera++; return camera.promise; };
  f.context.processCapturedPhoto = async () => {
    f.context.PHOTO_CAPTURE_BUSY = true;
    await processing.promise;
    f.counts.saved++;
    f.context.PHOTO_CAPTURE_BUSY = false;
    f.context.CURRENT_TASK = f.context.CURRENT_PHOTO_INDEX = null;
  };
  const captures = Array.from({ length: 4 }, () => f.capture());
  assert.equal(f.context.PHOTO_CAPTURE_STARTING, true);
  assert.equal(f.counts.checks, 1);
  ready.resolve(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.counts.camera, 1);
  await f.capture(); assert.equal(f.counts.camera, 1, 'No extra launch while camera is open');
  camera.resolve({ file: { name: 'photo.jpg' } });
  await new Promise(resolve => setImmediate(resolve));
  await f.capture(); assert.equal(f.counts.camera, 1, 'No extra launch while saving');
  processing.resolve(); await Promise.all(captures);
  assert.equal(f.counts.saved, 1);
  assert.equal(f.context.PHOTO_CAPTURE_STARTING, false);
  f.context.window.captureDriverPhoto = async () => { f.counts.camera++; return null; };
  await f.capture(); assert.equal(f.counts.camera, 2, 'A later intentional capture is allowed');

  // Denied/failed readiness and camera failures all release the lock for recovery.
  for (const failure of ['not-ready', 'readiness-error', 'camera-error', 'cancel']) {
    f = fixture();
    if (failure === 'not-ready') f.context.ensureTaskDeliveryReady = async () => false;
    if (failure === 'readiness-error') f.context.ensureTaskDeliveryReady = async () => { throw Error('read failed'); };
    if (failure === 'camera-error') f.context.window.captureDriverPhoto = async () => { throw Error('camera failed'); };
    await f.capture();
    assert.equal(f.context.PHOTO_CAPTURE_STARTING, false, failure);
    assert.equal(f.context.CURRENT_TASK, null, failure);
    if (failure.startsWith('readiness') || failure === 'not-ready') assert.equal(f.counts.previews, 0);
    f.context.ensureTaskDeliveryReady = async () => true;
    f.context.window.captureDriverPhoto = async () => { f.counts.camera++; return null; };
    const before = f.counts.camera;
    await f.capture(); assert.equal(f.counts.camera, before + 1, failure + ' must permit retry');
  }

  // Browser file-picker fallback remains guarded until its cancel/change callback.
  f = fixture();
  f.context.window.captureDriverPhoto = async () => ({ native: true });
  await f.capture(); await f.capture(); assert.equal(f.counts.fallback, 1);
  f.context.cameraInput.oncancel(); await f.capture(); assert.equal(f.counts.fallback, 2);

  // Do not open a camera if sync starts while readiness is being checked.
  f = fixture(); const syncing = deferred();
  f.context.ensureTaskDeliveryReady = () => syncing.promise;
  const attempted = f.capture(); f.context.SYNC_RUNNING = true; syncing.resolve(true); await attempted;
  assert.equal(f.counts.camera, 0);
  assert.equal(f.context.PHOTO_CAPTURE_STARTING, false);
}
console.log('PASS: web/WIP rapid taps open one camera; capture stays locked through saving; readiness/camera failure, cancel, file picker and sync transitions recover.');
