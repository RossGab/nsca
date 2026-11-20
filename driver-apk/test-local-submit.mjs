import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRecoveryBackupQueue } from '../driver-local-submit.js';

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

for (const file of ['driver.html', 'driver-wip.html']) {
  const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
  const start = source.indexOf('  window.submitTask = async function');
  const code = source.slice(start, source.indexOf('// Use one delegated listener', start));
  const draftStart = source.indexOf('function syncDynamicFields(taskKey)');
  const draftCode = source.slice(draftStart, source.indexOf('function loadFormCache()', draftStart));
  let draft;
  const draftContext = {
    document: { getElementById: () => ({ querySelectorAll: () => [
      { getAttribute: () => 'note', type: 'text', value: 'Latest entry' }
    ] }) },
    BILLING_CACHE: { one: { deliveryType: 'Delivered', note: 'Old entry' } },
    loadFormCache: () => ({}), saveFormCache() {},
    saveTaskDraft: async (key, fields) => { draft = { key, fields }; },
    getTasksFromIndexedDB: () => assert.fail('Draft save must not read a stale whole-task snapshot'),
    saveTasksToIndexedDB: () => assert.fail('Draft save must not write a stale task status'),
    storageDiagnostic: { record() {} }, setStorageWarning() {}
  };
  vm.createContext(draftContext); vm.runInContext(draftCode, draftContext);
  draftContext.syncDynamicFields('one');
  assert.equal(draft.key, 'one');
  assert.equal(draft.fields.note, 'Latest entry');
  assert.equal(draft.fields.status, undefined);
  function fixture({ failCommit = false, commitGate } = {}) {
    const task = { _key: 'one', driverId: 'driver_001', dateKey: '20261120', status: 'PENDING', CUSTOMERNAME: 'Keep customer' };
    const calls = [], alerts = [];
    let removed = false;
    const button = { dataset: { submitTask: 'one' }, disabled: false, innerText: '' };
    const context = {
      PHOTO_CAPTURE_STARTING: false, PHOTO_CAPTURE_BUSY: false, SYNC_RUNNING: false,
      submitLock: {}, UPLOAD_QUEUE_COUNT: 88, CURRENT_RENDER_LIST: [{ ...task }],
      PHOTO_BUFFER: { one: { 1: { id: 'photo' } } }, ACTIVE_CAPTURE_TASK: 'one', BILLING_CACHE: { one: { deliveryType: 'Delivered', note: 'Keep note' } },
      document: { querySelectorAll: () => [button], body: { contains: () => !removed } },
      getTaskFromIndexedDB: async () => { calls.push('read-one'); return task; },
      ensureTaskDeliveryReady: async (key, selected) => { assert.equal(selected, task); return true; },
      syncDynamicFields() {}, validateDynamic: async (key, selected) => { assert.equal(selected, task); return true; },
      getTasksFromIndexedDB: () => assert.fail('Submit must not scan all tasks'),
      readPhotoDetails: () => assert.fail('Submit must not transfer photo blobs'),
      completeLocalTask: async (_, data) => {
        calls.push('commit'); if (commitGate) await commitGate.promise;
        if (failCommit) throw Error('storage full');
        task.status = 'LOCAL_COMPLETED'; task.deliveryData = data; task.recoveryBackupPending = true;
        return { task, alreadyCompleted: false };
      },
      storageDiagnostic: { record() {} }, updateTaskMapMarkerAfterLocalSubmit() {},
      URL: { revokeObjectURL() {} }, loadFormCache: () => ({ one: { note: 'Keep note' } }), saveFormCache() {},
      getRecoveryBackupQueue: () => ({ enqueue: () => calls.push('queue-backup') }),
      removeTaskFromUI: () => { assert.equal(task.status, 'LOCAL_COMPLETED'); removed = true; calls.push('ui'); },
      updateUploadCounter: () => calls.push('count'), alert: message => alerts.push(message)
    };
    context.window = context;
    vm.createContext(context); vm.runInContext(code, context);
    return { context, task, calls, alerts, button, removed: () => removed };
  }
  let f = fixture();
  await f.context.submitTask('one');
  assert.deepEqual(f.calls, ['read-one', 'commit', 'queue-backup', 'ui', 'count']);
  assert.equal(f.context.UPLOAD_QUEUE_COUNT, 89);
  assert.equal(f.task.CUSTOMERNAME, 'Keep customer');
  assert.equal(f.task.deliveryData.note, 'Keep note');
  await f.context.submitTask('one');
  assert.equal(f.context.UPLOAD_QUEUE_COUNT, 89, 'Already completed task must not be counted twice');
  assert.equal(f.calls.filter(call => call === 'commit').length, 1);
  f = fixture({ failCommit: true });
  await f.context.submitTask('one');
  assert.equal(f.removed(), false);
  assert.equal(f.task.status, 'PENDING');
  assert.equal(f.context.UPLOAD_QUEUE_COUNT, 88);
  assert.equal(f.context.PHOTO_BUFFER.one[1].id, 'photo');
  assert.equal(f.button.disabled, false);
  assert.equal(f.calls.includes('queue-backup'), false);
  const gate = deferred(); f = fixture({ commitGate: gate });
  const submitting = f.context.submitTask('one');
  await new Promise(resolve => setImmediate(resolve));
  await f.context.submitTask('one');
  assert.equal(f.calls.filter(call => call === 'commit').length, 1);
  assert.equal(f.removed(), false, 'UI must wait for durable commit');
  gate.resolve(); await submitting;
  assert.equal(f.removed(), true);
}

let task = { _key: 'one', status: 'LOCAL_COMPLETED', recoveryBackupPending: true, deliveryData: { note: 'Keep note' } };
let writes = 0, marks = 0, fail = true;
const options = {
  readTask: async () => task, isBusy: () => false,
  writeBackup: async () => { writes++; if (fail) throw Error('backup storage unavailable'); },
  markDone: async () => { marks++; task.recoveryBackupPending = false; }
};
let queue = createRecoveryBackupQueue(options);
queue.enqueue('one'); await queue.drain(); queue.dispose();
assert.equal(task.recoveryBackupPending, true, 'Failed backup stays durable for reopen/retry');
assert.equal(marks, 0);
fail = false;
queue = createRecoveryBackupQueue(options);
queue.resume([task]); await queue.drain(); queue.dispose();
assert.equal(task.recoveryBackupPending, false);
assert.equal(task.deliveryData.note, 'Keep note');
assert.equal(writes, 2); assert.equal(marks, 1);

const saving = deferred(); task.recoveryBackupPending = true;
queue = createRecoveryBackupQueue({ ...options, writeBackup: () => saving.promise });
queue.enqueue('one'); const background = queue.drain();
await new Promise(resolve => setImmediate(resolve));
assert.equal(task.recoveryBackupPending, true, 'Never acknowledge a backup before its save succeeds');
saving.resolve(); await background; queue.dispose();
assert.equal(task.recoveryBackupPending, false);
console.log('PASS: web/WIP Submit reads one task, avoids photo transfers and route scans, awaits commit, rejects duplicate submits, preserves data on failure; backups retry after reopen and acknowledge only after save.');
