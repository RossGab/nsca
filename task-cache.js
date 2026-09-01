const DB_NAME = "nsca-admin-task-cache";
const DB_VERSION = 1;
const STORE_NAME = "dateRanges";
const CACHE_SCHEMA_VERSION = 2;

export const TASK_CACHE_FULL_REFRESH_MS = 6 * 60 * 60 * 1000;
export const TASK_CACHE_OVERLAP_MS = 5 * 60 * 1000;

function openCacheDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function cacheKey(from, to) {
  return `${from}::${to}`;
}

function toStorable(value) {
  if (value === null || value === undefined) return value;
  if (typeof value?.toMillis === "function") {
    return new Date(value.toMillis()).toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toStorable);
  if (typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, child]) => {
      result[key] = toStorable(child);
    });
    return result;
  }
  return value;
}

export function taskTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  }
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

export function taskCacheWatermark(tasks, fallback = 0) {
  return tasks.reduce(
    (latest, task) => Math.max(latest, taskTimestampMillis(task.updatedAt)),
    fallback
  );
}

export async function readTaskCache(from, to) {
  if (typeof indexedDB === "undefined") return null;
  let database;
  try {
    database = await openCacheDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    return await requestResult(
      transaction.objectStore(STORE_NAME).get(cacheKey(from, to))
    );
  } catch (error) {
    console.warn("Task cache read unavailable:", error);
    return null;
  } finally {
    database?.close();
  }
}

export async function writeTaskCache(from, to, tasks, options = {}) {
  if (typeof indexedDB === "undefined") return null;
  let database;
  try {
    database = await openCacheDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const entry = {
      key: cacheKey(from, to),
      schemaVersion: CACHE_SCHEMA_VERSION,
      from,
      to,
      tasks: toStorable(tasks),
      syncedAt: Date.now(),
      fullSyncedAt: options.full
        ? Date.now()
        : (options.previousFullSyncedAt || 0),
      watermarkMillis: taskCacheWatermark(tasks, options.previousWatermark || 0)
    };
    await requestResult(transaction.objectStore(STORE_NAME).put(entry));
    return entry;
  } catch (error) {
    console.warn("Task cache write unavailable:", error);
    return null;
  } finally {
    database?.close();
  }
}

export function mergeTaskUpdates(cachedTasks, updatedTasks, from, to) {
  const tasksById = new Map((cachedTasks || []).map(task => [task._key, task]));

  (updatedTasks || []).forEach(task => {
    const assignedDate = String(task.assignedDate || "").slice(0, 10);
    if (task.deleted === true) {
      tasksById.delete(task._key);
    } else if (assignedDate >= from && assignedDate <= to) {
      tasksById.set(task._key, task);
    } else {
      tasksById.delete(task._key);
    }
  });

  return [...tasksById.values()];
}

export function taskCacheNeedsFullRefresh(entry) {
  return !entry ||
    entry.schemaVersion !== CACHE_SCHEMA_VERSION ||
    !Array.isArray(entry.tasks) ||
    Date.now() - (entry.fullSyncedAt || 0) >= TASK_CACHE_FULL_REFRESH_MS;
}

export function excludeDeletedTasks(tasks) {
  return (tasks || []).filter(task => task.deleted !== true);
}

export async function removeTasksFromAllCaches(taskIds) {
  const ids = new Set(taskIds || []);
  if (!ids.size) return;

  if (typeof indexedDB === "undefined") return;
  let database;
  try {
    database = await openCacheDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const entries = await requestResult(store.getAll());

    for (const entry of entries) {
      const filtered = (entry.tasks || []).filter(task => !ids.has(task._key));
      if (filtered.length === (entry.tasks || []).length) continue;
      entry.tasks = filtered;
      entry.syncedAt = Date.now();
      const updateTransaction = database.transaction(STORE_NAME, "readwrite");
      await requestResult(updateTransaction.objectStore(STORE_NAME).put(entry));
    }
  } catch (error) {
    console.warn("Task cache delete update unavailable:", error);
  } finally {
    database?.close();
  }
}

export async function updateTasksInAllCaches(taskUpdates) {
  const updates = taskUpdates instanceof Map
    ? taskUpdates
    : new Map(Object.entries(taskUpdates || {}));
  if (!updates.size || typeof indexedDB === "undefined") return;

  let database;
  try {
    database = await openCacheDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const entries = await requestResult(transaction.objectStore(STORE_NAME).getAll());

    for (const entry of entries) {
      let changed = false;
      entry.tasks = (entry.tasks || []).map(task => {
        const update = updates.get(task._key);
        if (!update) return task;
        changed = true;
        return { ...task, ...toStorable(update) };
      });
      if (!changed) continue;

      entry.syncedAt = Date.now();
      // Preserve the server-derived watermark. A local clock can be ahead of
      // Firestore and advancing it here could cause a later incremental sync
      // to skip server updates.
      const updateTransaction = database.transaction(STORE_NAME, "readwrite");
      await requestResult(updateTransaction.objectStore(STORE_NAME).put(entry));
    }
  } catch (error) {
    console.warn("Task cache update unavailable:", error);
  } finally {
    database?.close();
  }
}
