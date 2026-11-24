const maxBytes = 10 * 1024 * 1024;
const extensions = new Set(["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"]);
const byId = id => document.getElementById(id);
const panel = byId("contractAttachments");
const upload = byId("contractUpload");
const filesInput = byId("contractFiles");
const list = byId("contractFileList");
const message = byId("contractMessage");
const submit = upload.querySelector('[type="submit"]');
let employeeId = "";
let selection = 0;
let uploading = false;
let database;

function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("nsca-payroll-poc", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("attachments", {autoIncrement: true});
        store.createIndex("employeeId", "employeeId");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => {
      database = undefined;
      throw error;
    });
  }
  return database;
}

async function refresh(id, version) {
  const db = await openDatabase();
  const request = db.transaction("attachments").objectStore("attachments").index("employeeId").getAll(id);
  const attachments = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (version !== selection) return;
  list.replaceChildren();
  message.textContent = attachments.length ? "" : "No attachments yet.";
  for (const {file} of attachments) {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = file.name;
    button.addEventListener("click", () => {
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    row.append(button);
    list.append(row);
  }
}

export function selectContractEmployee(id) {
  const version = ++selection;
  employeeId = id;
  panel.hidden = !id;
  byId("contractEmployee").textContent = id ? "Employee " + id : "";
  message.textContent = id ? "Loading attachments…" : "";
  upload.reset();
  list.replaceChildren();
  if (id) refresh(id, version).catch(error => {
    if (version === selection) message.textContent = "Could not load attachments. " + error.message;
  });
}

upload.addEventListener("submit", async event => {
  event.preventDefault();
  const id = employeeId;
  const version = selection;
  const files = [...filesInput.files];
  if (!id || !files.length || uploading) return;
  if (files.some(file => !extensions.has(file.name.split(".").pop().toLowerCase()) || !file.size || file.size > maxBytes)) {
    message.textContent = "Choose supported, nonempty files up to 10 MB each.";
    return;
  }
  uploading = submit.disabled = filesInput.disabled = true;
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("attachments", "readwrite");
      const store = transaction.objectStore("attachments");
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
      for (const file of files) store.add({employeeId: id, file});
    });
    if (version === selection) {
      upload.reset();
      await refresh(id, version);
    }
  } catch (error) {
    if (version === selection) message.textContent = "Could not save or reload attachments. " + error.message;
  } finally {
    uploading = submit.disabled = filesInput.disabled = false;
  }
});
