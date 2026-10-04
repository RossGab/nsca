(function () {
  const key = "driverStorageDiagnosticsV1";
  let memory = [];
  function events() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(saved) ? saved : memory;
    }
    catch (_) { return memory; }
  }
  function record(event, details = {}) {
    const entries = events();
    entries.push({ at: new Date().toISOString(), event, details });
    memory = entries.slice(-200);
    try { localStorage.setItem(key, JSON.stringify(memory)); } catch (_) {}
  }
  function timed(label, operation, milliseconds = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`${label} timed out after ${milliseconds / 1000} seconds`);
        error.name = "TimeoutError";
        reject(error);
      }, milliseconds);
      Promise.resolve().then(operation).then(value => {
        clearTimeout(timer); resolve(value);
      }, error => { clearTimeout(timer); reject(error); });
    });
  }
  window.DriverStorageDiagnostics = { events, record, timed };
})();
