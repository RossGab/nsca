(function () {
  "use strict";

  const dialogTitle = document.currentScript?.dataset.dialogTitle ||
    "NSCA Task Administration";
  const pendingMessages = [];
  let dialogVisible = false;
  let elements = null;
  let currentRequest = null;

  function buildDialog() {
    if (elements) return elements;

    const style = document.createElement("style");
    style.textContent = `
      .admin-alert-overlay{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.62)}
      .admin-alert-overlay.visible{display:flex}
      .admin-alert-box{width:min(410px,100%);overflow:hidden;border-radius:15px;background:#fff;box-shadow:0 24px 65px rgba(0,0,0,.34);font-family:Arial,sans-serif}
      .admin-alert-header{display:flex;align-items:center;gap:11px;padding:14px 17px;background:#123d67;color:#fff;font-size:16px;font-weight:700}
      .admin-alert-logo{width:36px;height:36px;border-radius:50%;object-fit:cover;background:#fff}
      .admin-alert-body{min-height:90px;padding:21px 19px;color:#172033;font-size:15px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
      .admin-alert-input{display:none;width:calc(100% - 38px);margin:0 19px 18px;padding:11px 12px;border:1px solid #aeb9c8;border-radius:8px;background:#fff;color:#172033;font-size:16px}
      .admin-alert-actions{display:flex;justify-content:flex-end;padding:0 19px 19px}
      .admin-alert-actions{gap:9px}.admin-alert-ok,.admin-alert-cancel{min-width:92px;padding:10px 18px;border:0;border-radius:9px;color:#fff;font-size:14px;font-weight:700;cursor:pointer}
      .admin-alert-ok{background:#2e7d32}.admin-alert-cancel{display:none;background:#64748b}
      .admin-alert-ok:focus{outline:3px solid rgba(46,125,50,.3);outline-offset:2px}
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.className = "admin-alert-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "adminAlertTitle");
    overlay.setAttribute("aria-describedby", "adminAlertBody");
    overlay.setAttribute("aria-hidden", "true");

    const box = document.createElement("div");
    box.className = "admin-alert-box";

    const header = document.createElement("div");
    header.className = "admin-alert-header";
    const logo = document.createElement("img");
    logo.className = "admin-alert-logo";
    logo.src = "./logo.jpg";
    logo.alt = "";
    const title = document.createElement("span");
    title.id = "adminAlertTitle";
    title.textContent = dialogTitle;
    header.append(logo, title);

    const body = document.createElement("div");
    body.id = "adminAlertBody";
    body.className = "admin-alert-body";

    const input = document.createElement("input");
    input.className = "admin-alert-input";
    input.type = "text";

    const actions = document.createElement("div");
    actions.className = "admin-alert-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "admin-alert-cancel";
    cancel.textContent = "Cancel";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "admin-alert-ok";
    ok.textContent = "OK";
    actions.append(cancel, ok);
    box.append(header, body, input, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    elements = { overlay, body, input, cancel, ok };
    ok.addEventListener("click", () => closeCurrentMessage(true));
    cancel.addEventListener("click", () => closeCurrentMessage(false));
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") closeCurrentMessage(true);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && dialogVisible) closeCurrentMessage(false);
    });
    return elements;
  }

  function showNextMessage() {
    if (dialogVisible || !pendingMessages.length || !document.body) return;
    const ui = buildDialog();
    currentRequest = pendingMessages.shift();
    ui.body.textContent = currentRequest.message;
    const isPrompt = currentRequest.type === "prompt";
    const needsCancel = currentRequest.type === "confirm" || isPrompt;
    ui.input.style.display = isPrompt ? "block" : "none";
    ui.input.value = isPrompt ? currentRequest.defaultValue : "";
    ui.cancel.style.display = needsCancel ? "inline-block" : "none";
    ui.ok.textContent = currentRequest.type === "alert" ? "OK" : "Continue";
    ui.overlay.classList.add("visible");
    ui.overlay.setAttribute("aria-hidden", "false");
    dialogVisible = true;
    (isPrompt ? ui.input : ui.ok).focus();
  }

  function closeCurrentMessage(accepted) {
    if (!elements) return;
    const finishedRequest = currentRequest;
    elements.overlay.classList.remove("visible");
    elements.overlay.setAttribute("aria-hidden", "true");
    dialogVisible = false;
    currentRequest = null;
    if (finishedRequest?.resolve) {
      if (finishedRequest.type === "prompt") {
        finishedRequest.resolve(accepted ? elements.input.value : null);
      } else {
        finishedRequest.resolve(accepted === true);
      }
    }
    showNextMessage();
  }

  window.alert = function (message) {
    pendingMessages.push({ type: "alert", message: String(message ?? "") });
    if (document.body) showNextMessage();
    else document.addEventListener("DOMContentLoaded", showNextMessage, { once: true });
  };

  window.nscaAlert = window.alert;
  window.nscaConfirm = function (message) {
    return new Promise(resolve => {
      pendingMessages.push({ type: "confirm", message: String(message ?? ""), resolve });
      if (document.body) showNextMessage();
      else document.addEventListener("DOMContentLoaded", showNextMessage, { once: true });
    });
  };
  window.nscaPrompt = function (message, defaultValue = "") {
    return new Promise(resolve => {
      pendingMessages.push({
        type: "prompt",
        message: String(message ?? ""),
        defaultValue: String(defaultValue ?? ""),
        resolve
      });
      if (document.body) showNextMessage();
      else document.addEventListener("DOMContentLoaded", showNextMessage, { once: true });
    });
  };
})();
