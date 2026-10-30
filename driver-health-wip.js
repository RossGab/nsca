(function () {
  function evaluate(memory, storage, errors) {
    const reasons = [];
    if (memory && memory.used / memory.limit >= 0.8) reasons.push("JavaScript heap is above 80% of its browser limit.");
    if (storage && storage.usage / storage.quota >= 0.9) reasons.push("Site storage is above 90% of its quota.");
    if (errors.length) return { state: "problem", label: "Problem detected", reasons: reasons.concat("A recent error was recorded. Open details below.") };
    if (reasons.length) return { state: "warning", label: "Warning", reasons };
    if (!memory) return { state: "unknown", label: "Memory unavailable", reasons: ["This browser does not expose JavaScript heap measurements."] };
    return { state: "normal", label: "No detected issues", reasons: ["Available measurements are below warning thresholds."] };
  }
  window.DriverHealthEvaluate = evaluate;
  const mount = document.getElementById("appHealthMount");
  if (!mount) return;
  const style = document.createElement("style");
  style.textContent = '#appHealthMount{margin:6px 0 12px}#appHealthButton{display:flex;align-items:center;gap:8px;padding:10px 14px;min-height:44px;border:1px solid #777;border-radius:20px;background:#fff;color:#172033}#appHealthDot{width:12px;height:12px;border-radius:50%;background:#64748b;flex:none}#appHealthPanel{background:#fff;color:#172033;border:1px solid #aaa;border-radius:8px;padding:12px;margin-top:8px;line-height:1.5}#appHealthPanel p{margin:6px 0}#appHealthPanel pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px monospace;max-height:180px;overflow:auto}';
  document.head.appendChild(style);
  mount.innerHTML = '<button type="button" id="appHealthButton" aria-expanded="false" aria-controls="appHealthPanel"><span id="appHealthDot" aria-hidden="true"></span><span id="appHealthLabel">App health: Checking...</span></button><section id="appHealthPanel" aria-label="App health details" hidden><p data-summary></p><p data-memory></p><p data-storage></p><p data-device></p><p data-checked></p><p>Memory means JavaScript heap, not total phone RAM or camera memory. Storage is this site’s quota, not free phone space. These are warning signals; this indicator cannot predict or prevent a crash.</p><p>Warning thresholds: heap 80%; storage 90%. Errors remain visible for 5 minutes.</p><pre data-errors></pre></section>';
  const button = mount.querySelector("button");
  const panel = mount.querySelector("section");
  let storage = null, storageAt = 0, pending = false;
  const errors = [];
  const started = Date.now();
  const seen = new Set();
  const mb = bytes => (bytes / 1048576).toFixed(1) + " MB";
  function remember(message, at = Date.now()) {
    errors.push({ message: String(message).slice(0, 350), at });
    if (errors.length > 10) errors.shift();
  }
  window.addEventListener("error", event => {
    if (event.message) remember(event.message);
    else if (event.target?.src || event.target?.href) remember("A page resource failed to load.");
    render();
  }, true);
  window.addEventListener("unhandledrejection", event => {
    remember(event.reason?.message || String(event.reason || "Unhandled operation failure"));
    render();
  });
  function render() {
    const now = Date.now();
    while (errors.length && errors[0].at < now - 300000) errors.shift();
    const events = window.DriverStorageDiagnostics?.events() || [];
    for (const event of events) {
      const at = Date.parse(event.at);
      const key = event.sessionId + event.at + event.event;
      if (at < started || seen.has(key)) continue;
      seen.add(key);
      if (/(?:failed|error|timeout|aborted|interrupted|stalled|blocked)$/.test(event.event)) remember(event.event + (event.details?.error ? ": " + (event.details.error.message || event.details.error) : ""), at);
    }
    if (seen.size > 600) { seen.clear(); for (const event of events) seen.add(event.sessionId + event.at + event.event); }
    const heap = performance.memory;
    const memory = heap && Number.isFinite(heap.usedJSHeapSize) && heap.jsHeapSizeLimit > 0
      ? { used: heap.usedJSHeapSize, limit: heap.jsHeapSizeLimit } : null;
    const result = evaluate(memory, storage, errors);
    mount.querySelector("#appHealthDot").style.background = { normal: "#15803d", warning: "#ca8a04", problem: "#dc2626", unknown: "#64748b" }[result.state];
    mount.querySelector("#appHealthLabel").textContent = "App health: " + result.label;
    panel.querySelector("[data-summary]").textContent = result.reasons.join(" ");
    panel.querySelector("[data-memory]").textContent = memory ? "JS heap: " + mb(memory.used) + " / " + mb(memory.limit) + " (" + Math.round(100 * memory.used / memory.limit) + "%)." : "JS heap: unavailable.";
    panel.querySelector("[data-storage]").textContent = storage ? "Site storage: " + mb(storage.usage) + " / " + mb(storage.quota) + ". Sampled " + new Date(storageAt).toLocaleTimeString() + "." : "Site storage: unavailable or checking.";
    panel.querySelector("[data-device]").textContent = navigator.deviceMemory ? "Approximate device RAM: " + navigator.deviceMemory + " GB. Available RAM is unknown." : "Device RAM: unavailable.";
    panel.querySelector("[data-checked]").textContent = "Updated: " + new Date(now).toLocaleTimeString() + ".";
    panel.querySelector("[data-errors]").textContent = errors.length ? errors.map(error => new Date(error.at).toLocaleTimeString() + " " + error.message).join("\n") : "No errors recorded in the last 5 minutes of this test session.";
  }
  async function sample() {
    if (document.hidden) return;
    render();
    if (pending || Date.now() - storageAt < 30000 || !navigator.storage?.estimate) return;
    pending = true;
    try {
      const value = await navigator.storage.estimate();
      storage = Number.isFinite(value.usage) && value.quota > 0 ? value : null;
    } catch (_) { storage = null; }
    finally { storageAt = Date.now(); pending = false; render(); }
  }
  button.onclick = () => {
    panel.hidden = !panel.hidden;
    button.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) sample();
  };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sample(); });
  setInterval(sample, 5000);
  sample();
})();
