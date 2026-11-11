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
    let failures = 0;
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
        if (updates.length) await saveTasks(updates);
        render((await getTasks()).filter(eligible), { failures });
        await new Promise(resolve => setTimeout(resolve,0));
      }
    } finally {
      running = false;
    }
  };
}
