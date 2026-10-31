import { registerPlugin } from '@capacitor/core';
export const storageBridge = registerPlugin('DriverStorage');

const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const preferenceKeys = ['driverId', 'driverUIConfigCache', 'driverFormCache', 'driver_pending_capture'];
export async function blobBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read saved photo'));
    reader.readAsDataURL(blob);
  });
}
export async function sha256(blob) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function readLegacyDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('driver_uploads');
    let missing = false, settled = false;
    const fail = error => { if(!settled) {settled=true;clearTimeout(timer);reject(error);} };
    const timer=setTimeout(()=>fail(new Error('Existing task storage did not respond. Reopen the app to retry.')),15000);
    request.onupgradeneeded = () => { missing = true; request.transaction.abort(); request.result.close(); };
    request.onerror = () => {
      if(missing && !settled) { settled=true;clearTimeout(timer);resolve(null); }
      else fail(request.error || new Error('Cannot open existing task data'));
    };
    request.onblocked = () => fail(new Error('Close the storage viewer and reopen the app to move saved data'));
    request.onsuccess = () => {
      if(settled) { request.result.close(); return; }
      settled=true;clearTimeout(timer);resolve(request.result);
    };
  });
}
export function legacyRead(db, store, method, key) {
  if (!db?.objectStoreNames.contains(store)) return Promise.resolve(method === 'get' ? undefined : []);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = key === undefined ? tx.objectStore(store)[method]() : tx.objectStore(store)[method](key);
    let value;
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(tx.error || request.error || new Error('Could not read existing records'));
  });
}

// Does not delete or modify the legacy source. A failed attempt can be retried.
export async function migrate({ request, legacy, preferences, progress = () => {}, encode = blobBase64, digest = sha256 }) {
  const state = await request({ operation: 'get', store: 'meta', id: 'migration-v1' });
  if (state.row?.complete) return false;
  await request({ operation: 'resetMigration' });
  const tasks = await legacy.tasks();
  const photoIds = await legacy.photoIds();
  progress('Moving saved tasks to Android storage…');
  for (const task of tasks) {
    if (!task._key) throw new Error('A saved task has no ID. Existing records were kept.');
    await request({ operation: 'write', store: 'tasks', rows: [task] });
    const actual = await request({ operation: 'get', store: 'tasks', id: task._key });
    if (canonical(actual.row) !== canonical(JSON.parse(JSON.stringify(task)))) throw new Error('A copied task did not match its original');
  }
  for (let index = 0; index < photoIds.length; index++) {
    progress('Moving saved photo ' + (index + 1) + ' of ' + photoIds.length + '…');
    const photo = await legacy.photo(photoIds[index]);
    if (!photo || !(photo.blob instanceof Blob)) throw new Error('A saved photo could not be read. Existing data was kept.');
    const { blob, ...row } = photo;
    const expected = await digest(blob);
    await request({ operation: 'putPhoto', row: { ...row, mime: blob.type }, base64: await encode(blob) });
    const check = await request({ operation: 'checkPhoto', id: row.id });
    const copied = await request({ operation: 'get', store: 'photos', id: row.id });
    const { nativeFile, sha256: savedDigest, blobSize, mime, ...metadata } = copied.row || {};
    if (check.sha256 !== expected || savedDigest !== expected || blobSize !== blob.size || canonical(metadata) !== canonical(JSON.parse(JSON.stringify(row)))) throw new Error('A copied photo did not match its original');
  }
  for (const key of preferenceKeys) {
    const value = preferences.getItem(key);
    if (value == null) continue;
    await request({ operation: 'write', store: 'prefs', rows: [{ key, value }] });
    const check = await request({ operation: 'get', store: 'prefs', id: key });
    if (check.row?.value !== value) throw new Error('Driver settings could not be verified');
  }
  await request({ operation: 'completeMigration', tasks: tasks.length, photos: photoIds.length });
  return true;
}

export async function initializeNativeStorage() {
  const request = options => storageBridge.request(options);
  const notice = document.createElement('div');
  notice.style.cssText = 'position:fixed;inset:0;z-index:200000;background:#fff;color:#172033;padding:30px;display:flex;align-items:center;justify-content:center;text-align:center;white-space:pre-line';
  notice.setAttribute('role', 'status');
  notice.textContent = 'Opening saved Android tasks…';
  document.body.appendChild(notice);
  let db;
  try {
    const state = await request({ operation: 'get', store: 'meta', id: 'migration-v1' });
    if (!state.row?.complete) {
      db = await readLegacyDatabase(indexedDB);
      await migrate({ request, preferences: localStorage, progress: text => { notice.textContent = text; }, legacy: {
        tasks: () => legacyRead(db, 'tasks', 'getAll'),
        photoIds: () => legacyRead(db, 'photos', 'getAllKeys'),
        photo: id => legacyRead(db, 'photos', 'get', id)
      } });
    }
    const values = new Map((await request({ operation: 'list', store: 'prefs' })).rows.map(row => [row.key, row.value]));
    let pending = Promise.resolve();
    function persist(operation) {
      pending = pending.catch(() => {}).then(() => request(operation));
      pending.catch(error => {
        window.DriverStorageDiagnostics?.record('native_preferences_failed', { error: error.message });
        notice.textContent = 'Could not save driver settings. Keep the app open, free device space, then retry.\n' + error.message;
        if (!notice.isConnected) document.body.appendChild(notice);
      });
    }
    const preferences = {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem(key, value) { value=String(value); values.set(key,value); persist({ operation:'write',store:'prefs',rows:[{key,value}] }); },
      removeItem(key) { values.delete(key); persist({ operation:'delete',store:'prefs',id:key }); },
      flush: () => pending
    };
    // Other presentation scripts can still read their usual browser keys.
    for (const [key,value] of values) { try { localStorage.setItem(key,value); } catch (_) {} }
    const api = {
      request, preferences,
      tasks: async () => (await request({operation:'list',store:'tasks'})).rows,
      async saveTasks(tasks) {
        await preferences.flush();
        await request({operation:'write',store:'tasks',rows:tasks.filter(task=>task._key && task.dateKey),merge:true});
      },
      async savePhoto(record) {
        await preferences.flush();
        const {blob,...row}=record;
        await request({operation:'putPhoto',row:{...row,mime:blob.type},base64:await blobBase64(blob)});
      },
      photoDetails: async taskKey => (await request({operation:'list',store:'photos',...(taskKey == null ? {} : {taskKey})})).rows,
      async photo(id) {
        const result=await request({operation:'readPhoto',id});
        if(!result.row) return undefined;
        const bytes=Uint8Array.from(atob(result.base64),letter=>letter.charCodeAt(0));
        return {...result.row,blob:new Blob([bytes],{type:result.row.mime || 'image/jpeg'})};
      },
      stats: () => request({operation:'stats'})
    };
    window.DriverNativeStorage=api;
    notice.remove();
    return api;
  } catch (error) {
    notice.textContent = 'Android storage could not be prepared. Your previous saved data has not been removed.\nKeep this app installed and reopen it to retry.\n' + error.message;
    throw error;
  } finally { db?.close(); }
}
