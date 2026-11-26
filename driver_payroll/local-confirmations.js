let database;

function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("nsca-driver-confirmation-demo", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("confirmations");
      request.onsuccess = () => resolve(request.result);
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
    const transaction = db.transaction("confirmations", "readwrite");
    const store = transaction.objectStore("confirmations");
    let updateError;
    let updated;
    transaction.oncomplete = () => resolve(updated);
    transaction.onabort = () => reject(updateError || transaction.error);
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        updated = updater(request.result);
        if (updated !== request.result) store.put(updated, id);
      } catch (error) {
        updateError = error;
        transaction.abort();
      }
    };
  });
}
