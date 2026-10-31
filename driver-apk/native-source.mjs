// These substitutions affect the generated APK bundle only, never the web files.
function replaceRange(source, start, end, replacement) {
  const first=source.indexOf(start), last=source.indexOf(end,first+start.length);
  if(first<0 || last<0) throw new Error('Native storage integration point missing: '+start);
  return source.slice(0,first)+replacement+'\n\n'+source.slice(last);
}
export function nativeDriverSource(source, modulePath) {
  source=source.replace('const DB_NAME = "driver_uploads";', 'const DB_NAME = "driver-native.sqlite";').replace('const DB_VERSION = 7;', 'const DB_VERSION = 1;');
  source=replaceRange(source,'function openDB() {','function releasePhotoPreviews()',`
async function savePhotoToDB(record) { await driverNative.savePhoto(record); }
async function readPhotoDetails(taskKey, includeBlobs = false) {
  const rows=await driverNative.photoDetails(taskKey);
  if(!includeBlobs) return rows;
  const photos=[];
  for(const row of rows) photos.push(await driverNative.photo(row.id));
  return photos;
}
`);
  source=replaceRange(source,'async function getAllPhotosFromDB()','async function recoverTasksFromFiles()',`
async function getAllPhotosFromDB() { return readPhotoDetails(null,true); }
async function saveTasksToIndexedDB(tasks) {
  await driverNative.saveTasks(tasks);
  storageDiagnostic.record('tasks_saved',{count:tasks.length,backend:'native'});
}
async function getTasksFromIndexedDB() { return driverNative.tasks(); }
`);
  source=replaceRange(source,'async function deletePhotoFromDB(','async function archiveTransferredLocalTask(',`
async function deletePhotoFromDB(id) { await driverNative.request({operation:'delete',store:'photos',id}); }
async function deleteTaskFromIndexedDB(taskKey,reason='unspecified') {
  await driverNative.request({operation:'delete',store:'tasks',id:taskKey});
  storageDiagnostic.record('task_deleted',{taskId:taskKey,reason,backend:'native'});
}
`);
  source=replaceRange(source,'async function requestPersistentStorage()','// ✅ Default to today',`
async function requestPersistentStorage() {
  setStorageWarning('persistence','');
  return true; // Native private storage does not use browser persistence grants.
}
async function verifyOfflineDatabase() {
  try {
    const result=await driverNative.stats();
    setStorageWarning('database','');
    return result;
  } catch(error) {
    storageDiagnostic.record('native_database_failed',{error:error.message});
    setStorageWarning('database','Saved Android data could not be checked. Keep the app installed and retry before capturing more photos.');
    return null;
  }
}
async function initializeOfflineStorageProtection() {
  await requestPersistentStorage();
  await verifyOfflineDatabase();
  await checkStorageQuota();
}
async function checkStorageQuota() {
  try {
    const result=await driverNative.stats();
    const freeMB=result.freeBytes/1048576;
    setStorageWarning('quota',freeMB<STORAGE_WARNING_THRESHOLD_MB ? 'Device storage is low ('+Math.round(freeMB)+' MB free). Free space and sync completed work.' : '');
  } catch(error) { setStorageWarning('quota','Could not check device storage. Sync completed work when possible.'); }
}

`);
  source=replaceRange(source,'async function pruneOldTasks()','function syncDynamicFields(',`
async function pruneOldTasks() {
  const tasks=await driverNative.tasks(), photos=await driverNative.photoDetails(null);
  const photoKeys=new Set(photos.map(photo=>photo.taskKey));
  const now=Date.now(), remove=[], updated=[];
  for(const task of tasks) {
    if(!Number.isFinite(task.localFirstStoredAt) || task.localFirstStoredAt<=0) { task.localFirstStoredAt=now; updated.push(task); }
    if(resolveStatus(task)!=='PENDING' || photoKeys.has(task._key)) continue;
    const key=String(task.dateKey || '');
    const date=task.assignedDate || (/^\\d{8}$/.test(key) ? key.slice(0,4)+'-'+key.slice(4,6)+'-'+key.slice(6,8) : '');
    const assigned=Date.parse(date+'T00:00:00+08:00');
    if(now-(Number.isFinite(assigned)?assigned:task.localFirstStoredAt)>=7*86400000) remove.push(task._key);
  }
  if(updated.length) await driverNative.request({operation:'write',store:'tasks',rows:updated});
  if(remove.length) await driverNative.request({operation:'prune',ids:remove});
}
`);
  source=replaceRange(source,'    const dbi = await openDB();','  // 🧠 Photos already saved',`
    await driverNative.request({operation:'submitPhotos',taskKey});
`);
  source=replaceRange(source,'async function readExportPartPhotos(','async function downloadNextExportPart()',`
async function readExportPartPhotos(photoDetails) {
  const rows=[];
  for(const detail of photoDetails) rows.push(await driverNative.photo(detail.id) || detail);
  return rows;
}
`);
  if(/\bopenDB\(|\bphotoOperation\(|\bindexedDB\.|\bIDBKeyRange\b/.test(source)) throw new Error('An unconverted browser database path remains');
  source=source.replaceAll('localStorage.','driverPreferences.');
  source=source.replace('localStorage.setItem(', 'driverPreferences.setItem(');
  source=source.replace('location.reload();','await driverPreferences.flush();\n    location.reload();');
  source=source.replace('driverPreferences.setItem("driverId", DRIVER_ID);','driverPreferences.setItem("driverId", DRIVER_ID);\nawait driverPreferences.flush();');
  return `import { initializeNativeStorage } from ${JSON.stringify(modulePath)};\nconst driverNative=await initializeNativeStorage();\nconst driverPreferences=driverNative.preferences;\n`+source;
}

export function nativeViewerSource(source,modulePath) {
  source=source.replace('const DB_NAME = "driver_uploads";', 'const DB_NAME = "driver-native.sqlite";');
  source=replaceRange(source,'    function openExistingDatabase()','    async function loadStorage()',`
    async function openExistingDatabase() { return { close() {} }; }
    async function databaseExists() { return true; }
    async function readAll(db,store) { return store==='tasks' ? driverNative.tasks() : driverNative.photoDetails(null); }
`);
  source=source.replaceAll('localStorage.','driverNative.preferences.');
  source=source.replace('"Opening IndexedDB"','"Opening Android storage"');
  source=source.replace('for (const [method, label] of [["estimate", "Checking storage usage"], ["persisted", "Checking storage protection"]]) {',
    'Object.assign(storageDetails, await driverNative.stats());\n        for (const [method, label] of []) {');
  if(/\bindexedDB\./.test(source)) throw new Error('Viewer still reads browser task storage');
  return `import { initializeNativeStorage } from ${JSON.stringify(modulePath)};\nconst driverNative=await initializeNativeStorage();\n`+source;
}
