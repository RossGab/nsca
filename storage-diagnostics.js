(function () {
  const key = "driverStorageDiagnosticsV1";
  let memory = [];
  const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  let sequence = 0;
  const connections = new Map();
  const transactions = new Map();
  function failure(error) {
    return error ? { name: error.name || "Error", message: error.message || String(error) } : null;
  }
  function snapshot() {
    return { sessionId, activeConnections: [...connections.values()], activeTransactions: [...transactions.values()] };
  }
  function events() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(saved) ? saved : memory;
    }
    catch (_) { return memory; }
  }
  function record(event, details = {}) {
    const entries = events();
    entries.push({ at: new Date().toISOString(), sessionId, event, details });
    memory = entries.slice(-200);
    try { localStorage.setItem(key, JSON.stringify(memory)); } catch (_) {}
  }
  function timed(label, operation, milliseconds = 15000) {
    const started = Date.now();
    record("operation_started", { label });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`${label} timed out after ${milliseconds / 1000} seconds`);
        error.name = "TimeoutError";
        record("operation_timeout", { label, elapsedMs: Date.now() - started, ...snapshot() });
        reject(error);
      }, milliseconds);
      Promise.resolve().then(operation).then(value => {
        record("operation_succeeded", { label, elapsedMs: Date.now() - started });
        clearTimeout(timer); resolve(value);
      }, error => {
        record("operation_failed", { label, elapsedMs: Date.now() - started, error: failure(error) });
        clearTimeout(timer); reject(error);
      });
    });
  }
  function observeOpen(request, source) {
    const id = `${sessionId}-open-${++sequence}`;
    const started = Date.now();
    record("connection_open_started", { id, source, ...snapshot() });
    const timer = setTimeout(() => record("connection_open_stalled", { id, source, elapsedMs: Date.now() - started, ...snapshot() }), 15000);
    request.addEventListener("blocked", event => record("connection_blocked", { id, source, oldVersion: event.oldVersion, newVersion: event.newVersion, ...snapshot() }));
    request.addEventListener("upgradeneeded", event => record("database_upgrade", { id, source, oldVersion: event.oldVersion, newVersion: event.newVersion }));
    request.addEventListener("error", () => {
      clearTimeout(timer);
      record("connection_open_failed", { id, source, elapsedMs: Date.now() - started, error: failure(request.error) });
    });
    request.addEventListener("success", () => {
      clearTimeout(timer);
      const db = request.result;
      connections.set(id, { id, source, database: db.name, version: db.version, openedAt: new Date().toISOString() });
      record("connection_open_succeeded", { id, elapsedMs: Date.now() - started, activeCount: connections.size });
      const originalClose = db.close.bind(db);
      let closed = false;
      const close = reason => {
        if (closed) return;
        closed = true; connections.delete(id);
        record("connection_closed", { id, reason, activeCount: connections.size });
      };
      db.close = () => { originalClose(); close("close_requested"); };
      db.addEventListener("close", () => close("unexpected_browser_close"));
      db.addEventListener("versionchange", event => record("connection_versionchange", { id, oldVersion: event.oldVersion, newVersion: event.newVersion }));
      const originalTransaction = db.transaction.bind(db);
      db.transaction = (...args) => {
        let tx;
        try { tx = originalTransaction(...args); }
        catch (error) { record("transaction_start_failed", { connectionId: id, error: failure(error) }); throw error; }
        const transactionId = `${sessionId}-tx-${++sequence}`;
        const start = Date.now();
        const details = { transactionId, connectionId: id, stores: Array.from(tx.objectStoreNames), mode: tx.mode, startedAt: new Date().toISOString() };
        transactions.set(transactionId, details);
        record("transaction_started", details);
        const stallTimer = setTimeout(() => record("transaction_stalled", { ...details, elapsedMs: Date.now() - start }), 15000);
        const finish = result => {
          clearTimeout(stallTimer); transactions.delete(transactionId);
          record("transaction_" + result, { ...details, elapsedMs: Date.now() - start, error: failure(tx.error) });
        };
        tx.addEventListener("complete", () => finish("completed"));
        tx.addEventListener("abort", () => finish("aborted"));
        tx.addEventListener("error", event => record("transaction_error", { ...details, error: failure(event.target.error || tx.error) }));
        return tx;
      };
    });
    return request;
  }
  function lifecycle(event) {
    record("page_" + event.type, { visibility: document.visibilityState, persisted: event.persisted, online: navigator.onLine, ...snapshot() });
  }
  document.addEventListener("visibilitychange", lifecycle);
  for (const name of ["pageshow", "pagehide", "online", "offline"]) window.addEventListener(name, lifecycle);
  window.DriverStorageDiagnostics = { events, record, timed, observeOpen, snapshot };
  record("diagnostic_session", { page: location.origin + location.pathname, browser: navigator.userAgent, online: navigator.onLine });
  if (navigator.storage?.estimate) {
    timed("Storage usage snapshot", () => navigator.storage.estimate(), 5000)
      .then(value => record("storage_usage", { usageBytes: value.usage, quotaBytes: value.quota }))
      .catch(() => {});
  }
})();
