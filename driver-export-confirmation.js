import { matchesUploadReceipt } from './offline-export-receipts.js';

// Server-only reads, ten at a time. A read failure never changes local evidence.
export function createReceiptChecker({ driverId, getTasks, saveTasks, readServer, isBusy, render }) {
  let running = false;
  const eligible = t => t.status === 'LOCAL_COMPLETED' && t.exported &&
    String(t.driverId || '').trim().toUpperCase() === String(driverId() || '').trim().toUpperCase();
  const confirmed = t => t.offlineExport?.id && t.offlineExportConfirmed?.id === t.offlineExport.id;
  return async function checkExportUploadReceipts(initialTasks) {
    if (running) return;
    render(initialTasks.filter(eligible), { offline:!navigator.onLine });
    if (!navigator.onLine || isBusy()) return;
    running = true;
    let failures = 0, newlyConfirmed = 0;
    try {
      const pending = initialTasks.filter(t => eligible(t) && t.offlineExport?.id && !confirmed(t));
      for (let start=0; start<pending.length; start+=10) {
        if (isBusy() || !navigator.onLine) break;
        const results = await Promise.all(pending.slice(start,start+10).map(async task => {
          let timer;
          try {
            const server = await Promise.race([readServer(task._key), new Promise((_,reject) => {
              timer=setTimeout(() => reject(new Error('Receipt check timed out')),6000);
            })]);
            return matchesUploadReceipt(task,server) ? { key:task._key, id:task.offlineExport.id, server } : null;
          } catch (_) { failures++; return null; }
          finally { clearTimeout(timer); }
        }));
        const latest = await getTasks();
        const updates = [];
        for (const result of results.filter(Boolean)) {
          const task = latest.find(t => t._key === result.key);
          if (task && eligible(task) && task.offlineExport?.id === result.id && matchesUploadReceipt(task,result.server)) {
            updates.push({ ...task, offlineExportConfirmed:{id:result.id,checkedAt:new Date().toISOString()} });
          }
        }
        if (isBusy()) break;
        if (updates.length) { await saveTasks(updates); newlyConfirmed += updates.length; }
        render((await getTasks()).filter(eligible), { failures });
        await new Promise(resolve => setTimeout(resolve,0));
      }
    } finally {
      running = false;
      if (newlyConfirmed) render((await getTasks()).filter(eligible), { failures, newlyConfirmed });
    }
  };
}

export function createReceiptNotice() {
  let timer;
  function notice(id) {
    let element = document.getElementById(id);
    if (!element) {
      element = document.createElement('p'); element.id = id;
      element.setAttribute('role','status');
      element.style.cssText = 'padding:12px;border:1px solid #8b9aaa;border-radius:8px;font-size:14px';
      document.getElementById('syncBtn').after(element);
    }
    return element;
  }
  return (tasks, state = {}) => {
    const pending = tasks.filter(t => !t.offlineExport?.id || t.offlineExportConfirmed?.id !== t.offlineExport.id);
    const banner = notice('exportReceiptSummary');
    banner.hidden = !pending.length;
    banner.textContent = 'Waiting for office upload: ' + pending.length + ' task' + (pending.length === 1 ? '' : 's') + '.';
    if (state.offline && pending.length) banner.textContent += ' Connect to the internet to check office upload status.';
    else if (state.failures && pending.length) banner.textContent += ' Could not check some tasks. Refresh to try again.';
    if (state.newlyConfirmed) {
      const toast = notice('exportReceiptNotification');
      toast.textContent = 'Office upload confirmed for ' + state.newlyConfirmed + ' task' + (state.newlyConfirmed === 1 ? '' : 's') + '.';
      if (pending.length) toast.textContent += ' ' + pending.length + ' still waiting for office upload.';
      toast.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(() => { toast.hidden = true; }, 8000);
    }
  };
}
