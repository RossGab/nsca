// APK exports stream directly from SQLite/photo files, one saved part at a time.
export function nativeExportSource(source) {
  const start=source.indexOf('async function downloadNextExportPart()');
  const end=source.indexOf('async function refreshExportedTaskState(',start);
  if(start<0 || end<0) throw new Error('Native export integration point missing');
  return source.slice(0,start)+`
async function downloadNextExportPart() {
  const session = PENDING_EXPORT_SESSION;
  if (!session || session.busy) return;
  session.busy = true;
  const button = document.getElementById('downloadNextExportPartBtn');
  if (button) { button.style.display = 'none'; button.disabled = true; }
  const DriverExport = registerPlugin('DriverExport');
  const batchId = Date.now();
  try {
    while (session.nextIndex < session.parts.length) {
      const part = session.parts[session.nextIndex];
      const partNumber = session.nextIndex + 1;
      updateSyncProgress({ current: session.exportedTasks, total: session.totalTasks,
        currentTask: session.exportedTasks + ' of ' + session.totalTasks + ' tasks exported',
        currentPhoto: 'Saving file ' + partNumber + ' of ' + session.parts.length,
        successful: session.exportedTasks, message: 'Exporting all parts — keep the app open' });
      await DriverExport.savePart({
        name: 'tasks_export_' + batchId + '_part_' + partNumber + '_of_' + session.parts.length + '.json',
        taskIds: part.tasks.map(task => task._key), driverId: session.currentDriver,
        exportedAt: new Date().toISOString(), partNumber, totalParts: session.parts.length
      });
      // Only acknowledge this part after Android has finalized the saved file.
      await saveTasksToIndexedDB(part.tasks.map(task => ({ ...task, exported: true })));
      session.exportedTasks += part.tasks.length;
      session.nextIndex++;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await refreshExportedTaskState(session.currentDriver);
    updateSyncProgress({ current: session.totalTasks, total: session.totalTasks,
      successful: session.exportedTasks, message: 'All export files saved',
      currentTask: session.exportedTasks + ' tasks exported',
      currentPhoto: session.parts.length + ' file(s) saved' });
    alert('All ' + session.parts.length + ' export files are saved. Give every file to the administrator.');
    finishExportSession();
  } catch (error) {
    session.busy = false;
    await refreshExportedTaskState(session.currentDriver).catch(() => {});
    handleExportFailure(error);
  }
}

`+source.slice(end);
}
