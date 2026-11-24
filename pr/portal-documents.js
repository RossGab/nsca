let database;

export function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("nsca-payroll-poc", 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("attachments")) {
          const store = db.createObjectStore("attachments", {autoIncrement: true});
          store.createIndex("employeeId", "employeeId");
        }
        db.createObjectStore("documentDecisions", {keyPath: "id"});
      };
      request.onsuccess = () => {
        const db = request.result;
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

export async function listContractAttachments(id) {
  const db = await openDatabase();
  const request = db.transaction("attachments").objectStore("attachments").index("employeeId").openCursor(IDBKeyRange.only(id));
  return new Promise((resolve, reject) => {
    const results = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(results);
      results.push({id: cursor.primaryKey, ...cursor.value});
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function documentDecision(id) {
  const db = await openDatabase();
  const request = db.transaction("documentDecisions").objectStore("documentDecisions").get(id);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function recordDocumentDecision(id, action, name) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("documentDecisions", "readwrite");
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
    transaction.objectStore("documentDecisions").add({id, action, name, date: new Date()});
  });
}

export function downloadAttachment(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
