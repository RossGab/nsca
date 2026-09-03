(function () {
  "use strict";

  const dialogTitle = document.currentScript?.dataset.dialogTitle ||
    "NSCA Task Administration";
  const pendingMessages = [];
  let dialogVisible = false;
  let elements = null;

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
      .admin-alert-actions{display:flex;justify-content:flex-end;padding:0 19px 19px}
      .admin-alert-ok{min-width:92px;padding:10px 18px;border:0;border-radius:9px;background:#2e7d32;color:#fff;font-size:14px;font-weight:700;cursor:pointer}
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

    const actions = document.createElement("div");
    actions.className = "admin-alert-actions";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "admin-alert-ok";
    ok.textContent = "OK";
    actions.appendChild(ok);
    box.append(header, body, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    elements = { overlay, body, ok };
    ok.addEventListener("click", closeCurrentMessage);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && dialogVisible) closeCurrentMessage();
    });
    return elements;
  }

  function showNextMessage() {
    if (dialogVisible || !pendingMessages.length || !document.body) return;
    const ui = buildDialog();
    ui.body.textContent = pendingMessages.shift();
    ui.overlay.classList.add("visible");
    ui.overlay.setAttribute("aria-hidden", "false");
    dialogVisible = true;
    ui.ok.focus();
  }

  function closeCurrentMessage() {
    if (!elements) return;
    elements.overlay.classList.remove("visible");
    elements.overlay.setAttribute("aria-hidden", "true");
    dialogVisible = false;
    showNextMessage();
  }

  window.alert = function (message) {
    pendingMessages.push(String(message ?? ""));
    if (document.body) showNextMessage();
    else document.addEventListener("DOMContentLoaded", showNextMessage, { once: true });
  };

  window.nscaAlert = window.alert;
})();
