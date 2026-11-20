// Task completion and photo markers must succeed together before the UI reports success.
export function createBrowserSubmitStore({ openDB, taskStore, photoStore, keyRange }) {
  async function transaction(stores, mode, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(stores, mode); }
      catch (error) { db.close(); reject(error); return; }
      let result, failure, settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer); db.close();
        if (error) reject(error); else resolve(result);
      };
      const fail = error => { failure = error; try { tx.abort(); } catch {} finish(error); };
      const timer = setTimeout(() => fail(new Error('Saving the task timed out. Please retry.')), 15000);
      tx.oncomplete = () => finish();
      tx.onabort = tx.onerror = () => finish(failure || tx.error || new Error('Task storage failed.'));
      try { action(tx, value => { result = value; }, fail); } catch (error) { fail(error); }
    });
  }
  const getTask = key => transaction([taskStore], 'readonly', (tx, result) => {
    const request = tx.objectStore(taskStore).get(key);
    request.onsuccess = () => result(request.result || null);
  });
  const complete = (key, driverId, deliveryData) => transaction([taskStore, photoStore], 'readwrite', (tx, result, fail) => {
    const tasks = tx.objectStore(taskStore), photos = tx.objectStore(photoStore);
    const request = tasks.get(key);
    request.onsuccess = () => {
      try {
        const task = request.result;
        if (!task || String(task.driverId || '').trim().toUpperCase() !== String(driverId).trim().toUpperCase()) throw new Error('Saved task was not found for this driver.');
        if (task.status === 'LOCAL_COMPLETED') { result({ task, alreadyCompleted: true }); return; }
        if (task.finalized || task.exported || !['PENDING', 'CAPTURING', 'READY'].includes(task.status || 'PENDING')) throw new Error('This task can no longer be submitted.');
        let count = 0;
        const cursorRequest = photos.index('taskKey').openCursor(keyRange.only(key));
        cursorRequest.onsuccess = () => {
          try {
            const cursor = cursorRequest.result;
            if (cursor) {
              const photo = cursor.value;
              if (!(photo.blob instanceof Blob) || !photo.blob.size) throw new Error('A saved photo is missing or empty. Please retake it.');
              count++;
              cursor.update({ ...photo, submitIntent: true });
              cursor.continue();
              return;
            }
            if (!count) throw new Error('Please take at least 1 photo.');
            const completed = { ...task, status: 'LOCAL_COMPLETED', deliveryData, recoveryBackupPending: true };
            tasks.put(completed);
            result({ task: completed, alreadyCompleted: false });
          } catch (error) { fail(error); }
        };
      } catch (error) { fail(error); }
    };
  });
  const markBackupDone = key => transaction([taskStore], 'readwrite', tx => {
    const tasks = tx.objectStore(taskStore), request = tasks.get(key);
    request.onsuccess = () => { if (request.result) tasks.put({ ...request.result, recoveryBackupPending: false }); };
  });
  const saveDraft = (key, deliveryData) => transaction([taskStore], 'readwrite', tx => {
    const tasks = tx.objectStore(taskStore), request = tasks.get(key);
    request.onsuccess = () => {
      const task = request.result;
      if (task && !task.finalized && !task.exported && ['PENDING', 'CAPTURING', 'READY'].includes(task.status || 'PENDING')) {
        tasks.put({ ...task, deliveryData });
      }
    };
  });
  return { getTask, complete, markBackupDone, saveDraft };
}

// Pending work is recorded on the saved task, so closing the app cannot lose a backup request.
export function createRecoveryBackupQueue({ readTask, writeBackup, markDone, isBusy, report = () => {} }) {
  const waiting = new Set(), failed = new Set();
  let running = false, timer;
  const emit = (event, details) => { try { report(event, details); } catch {} };
  function enqueue(key) { waiting.add(key); schedule(); }
  function resume(tasks) {
    for (const task of tasks) if (task.status === 'LOCAL_COMPLETED' && task.recoveryBackupPending) waiting.add(task._key);
    if (waiting.size) schedule();
  }
  function schedule() {
    if (running || timer) return;
    timer = setTimeout(() => { timer = null; void drain(); }, 250);
  }
  async function drain() {
    if (running) return;
    if (isBusy()) { schedule(); return; }
    running = true;
    try {
      for (const key of waiting) {
        if (isBusy()) break;
        waiting.delete(key);
        try {
          const task = await readTask(key);
          if (task?.status === 'LOCAL_COMPLETED' && task.recoveryBackupPending) {
            await writeBackup(task);
            await markDone(key);
          }
          failed.delete(key);
        } catch (error) {
          failed.add(key);
          emit('recovery_backup_pending', { taskKey: key, error: error.message });
        }
        // Let the task screen paint and accept the next action between backups.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (!waiting.size && !failed.size) emit('recovery_backups_saved', {});
    } finally { running = false; if (waiting.size) schedule(); }
  }
  return { enqueue, resume, drain, dispose: () => { clearTimeout(timer); timer = null; } };
}
