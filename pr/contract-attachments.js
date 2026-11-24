import { openDatabase, listContractAttachments, downloadAttachment, documentDecision } from "./portal-documents.js?v=2";
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

async function refresh(id, version) {
  const attachments = await listContractAttachments(id);
  const decisions = await Promise.all(attachments.map(attachment => documentDecision(attachment.id)));
  if (version !== selection) return;
  list.replaceChildren();
  message.textContent = attachments.length ? "" : "No attachments yet.";
  for (const [index, {file}] of attachments.entries()) {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = file.name;
    button.addEventListener("click", () => downloadAttachment(file));
    row.append(button);
    const decision = decisions[index];
    if (decision) {
      const status = document.createElement("small");
      status.className = "subtext";
      status.textContent = decision.action + " by " + decision.name;
      row.append(status);
    }
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
