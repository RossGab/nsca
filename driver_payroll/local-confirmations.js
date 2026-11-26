let database;

export function dailyCounts(record) {
  const days = new Map();
  for (const task of record?.tasks || []) {
    const day = days.get(task.date) || {raw: 0, count: 0, confirmed: true};
    day.raw++;
    day.count++;
    day.confirmed &&= Boolean(task.confirmed);
    days.set(task.date, day);
  }
  for (const [date, adjustment] of Object.entries(record?.dayAdjustments || {})) {
    const raw = days.get(date)?.raw || 0;
    days.set(date, {raw, count: raw + adjustment.verifiedCount - adjustment.originalCount,
      confirmed: adjustment.confirmed === true});
  }
  return days;
}

function summary(record) {
  return {
    driverId: record.driverId, from: record.from, to: record.to,
    count: [...dailyCounts(record).values()].reduce((sum, day) => sum + day.count, 0),
    hasTasks: Boolean(record.tasks?.length || Object.keys(record.dayAdjustments || {}).length),
    openDiscrepancies: Object.values(record.dayDisputes || {}).filter(dispute => !dispute.resolvedAt).length,
    driverStatus: record.driver?.status, adminStatus: record.admin?.status, payrollStatus: record.payroll?.status
  };
}

function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("nsca-driver-confirmation-demo", 3);
      let blocked = false;
      request.onblocked = () => {
        blocked = true;
        reject(new Error("Refresh any other driver confirmation tabs, then reopen the cutoff."));
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        const records = db.objectStoreNames.contains("confirmations")
          ? request.transaction.objectStore("confirmations") : db.createObjectStore("confirmations");
        const summaries = db.objectStoreNames.contains("summaries")
          ? request.transaction.objectStore("summaries") : db.createObjectStore("summaries");
        if (!summaries.indexNames.contains("period")) summaries.createIndex("period", ["from", "to"]);
        const cursor = records.openCursor();
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) return;
          summaries.put(summary(entry.value), entry.primaryKey);
          entry.continue();
        };
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch(error => {
      database = undefined;
      throw error;
    });
  }
  return database;
}

export async function readConfirmation(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("confirmations").objectStore("confirmations").get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function updateConfirmation(id, updater) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["confirmations", "summaries"], "readwrite");
    const store = transaction.objectStore("confirmations");
    let updateError;
    let updated;
    transaction.oncomplete = () => resolve(updated);
    transaction.onabort = () => reject(updateError || transaction.error);
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        updated = updater(request.result);
        if (updated !== request.result) {
          store.put(updated, id);
          transaction.objectStore("summaries").put(summary(updated), id);
        }
      } catch (error) {
        updateError = error;
        transaction.abort();
      }
    };
  });
}

export async function listPeriodDrivers(from, to) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("summaries").objectStore("summaries").index("period").getAll([from, to]);
    request.onsuccess = () => resolve(request.result.filter(driver => driver.hasTasks ?? driver.count > 0));
    request.onerror = () => reject(request.error);
  });
}
