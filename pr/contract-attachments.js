import { getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getBlob, getStorage, listAll, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const maxBytes = 10 * 1024 * 1024;
const types = {
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp"
};
const byId = id => document.getElementById(id);
const panel = byId("contractAttachments");
const login = byId("contractSignIn");
const upload = byId("contractUpload");
const filesInput = byId("contractFiles");
const list = byId("contractFileList");
const message = byId("contractMessage");
let employeeId = "";
let auth;
let storage;
let sessionVersion = 0;

function folder(id) {
  return ref(storage, "payroll-contracts/" + encodeURIComponent(id));
}

async function refresh() {
  const version = ++sessionVersion;
  const id = employeeId;
  const user = auth.currentUser;
  list.replaceChildren();
  login.hidden = Boolean(user);
  byId("contractSignOut").hidden = !user;
  upload.hidden = true;
  if (!id || !user) return;
  try {
    const { claims } = await user.getIdTokenResult();
    if (version !== sessionVersion) return;
    if (claims.payrollContracts !== true) {
      message.textContent = "This account needs contract attachment access.";
      return;
    }
    const result = await listAll(folder(id));
    if (version !== sessionVersion) return;
    filesInput.disabled = false;
    upload.querySelector('[type="submit"]').disabled = false;
    upload.hidden = false;
    message.textContent = result.items.length ? "" : "No attachments yet.";
    for (const item of result.items) {
      const name = item.name.slice(item.name.indexOf("_") + 1);
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = name;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const blob = await getBlob(item, maxBytes);
          if (version !== sessionVersion) return;
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = name;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
          if (version === sessionVersion) message.textContent = "Download failed. " + error.message;
        } finally {
          button.disabled = false;
        }
      });
      row.append(button);
      list.append(row);
    }
  } catch (error) {
    if (version === sessionVersion) message.textContent = "Could not load attachments. " + error.message;
  }
}

export function selectContractEmployee(id) {
  employeeId = id;
  panel.hidden = !id;
  byId("contractEmployee").textContent = id ? "Employee " + id : "";
  message.textContent = "";
  upload.reset();
  if (!auth && id) {
    const app = getApp();
    auth = getAuth(app);
    storage = getStorage(app, "gs://driva-pwa.firebasestorage.app");
    onAuthStateChanged(auth, refresh);
  }
  if (auth) refresh();
}

login.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await signInWithEmailAndPassword(auth, byId("contractEmail").value.trim(), byId("contractPassword").value);
    login.reset();
  } catch {
    message.textContent = "Sign-in failed. Check your payroll account credentials.";
  }
});

byId("contractSignOut").addEventListener("click", async () => {
  await signOut(auth);
  message.textContent = "";
});

upload.addEventListener("submit", async event => {
  event.preventDefault();
  const id = employeeId;
  const version = sessionVersion;
  const files = [...filesInput.files].map(file => ({
    file,
    contentType: types[file.name.split(".").pop().toLowerCase()]
  }));
  if (!id || !files.length) return;
  if (files.some(({ file, contentType }) => !contentType || !file.size || file.size > maxBytes)) {
    message.textContent = "Choose supported, nonempty files up to 10 MB each.";
    return;
  }
  const submit = upload.querySelector('[type="submit"]');
  submit.disabled = true;
  filesInput.disabled = true;
  let uploaded = 0;
  try {
    for (const { file, contentType } of files) {
      if (version !== sessionVersion) return;
      const name = file.name.replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 120);
      await uploadBytes(ref(folder(id), crypto.randomUUID() + "_" + name), file, { contentType });
      uploaded++;
    }
    if (version === sessionVersion) {
      upload.reset();
      await refresh();
    }
  } catch (error) {
    if (version === sessionVersion) {
      await refresh();
      if (employeeId === id) message.textContent = uploaded + " uploaded. Upload stopped. " + error.message;
    }
  }
});
