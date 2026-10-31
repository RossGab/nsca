let active = false;
export function chooseSettings() {
  if (active) return Promise.resolve(null);
  active = true;
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const overlay = document.createElement('div');
    overlay.className = 'apk-settings-overlay';
    overlay.innerHTML = '<section class="apk-settings-drawer" role="dialog" aria-modal="true" aria-labelledby="apkSettingsTitle"><header><h2 id="apkSettingsTitle">Settings</h2><button type="button" data-close aria-label="Close settings">✕</button></header><nav aria-label="Driver settings"><button type="button" data-action="1"><strong>Change Driver ID</strong><span>Switch the driver using this device</span></button><button type="button" data-action="2"><strong>Recover Tasks</strong><span>Restore completed tasks from backup files</span></button><button type="button" data-action="3"><strong>Check Device Storage</strong><span>View saved tasks and photos</span></button></nav></section>';
    const style = document.createElement('style');
    style.textContent = '.apk-settings-overlay{position:fixed;inset:0;z-index:150000;background:#0f172a00;transition:background .2s ease}.apk-settings-drawer{position:absolute;right:0;top:0;bottom:0;width:min(340px,90vw);box-sizing:border-box;padding:calc(env(safe-area-inset-top,0px) + 20px) 20px 24px;background:#fff;color:#172033;box-shadow:-6px 0 24px #0002;transform:translateX(100%);transition:transform .2s ease;overflow-y:auto}.apk-settings-overlay.open{background:#0f172a88}.apk-settings-overlay.open .apk-settings-drawer{transform:translateX(0)}.apk-settings-drawer header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}.apk-settings-drawer h2{margin:0;font-size:22px}.apk-settings-drawer [data-close]{min-width:44px;min-height:44px;border:0;background:#f1f5f9;border-radius:10px;color:#172033;font-size:20px}.apk-settings-drawer nav{display:grid;gap:12px}.apk-settings-drawer [data-action]{display:flex;flex-direction:column;gap:6px;min-height:76px;padding:16px;text-align:left;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;color:#172033;font:16px Arial,sans-serif}.apk-settings-drawer span{font-size:13px;line-height:1.4;color:#64748b}.apk-settings-drawer button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}@media(prefers-reduced-motion:reduce){.apk-settings-overlay,.apk-settings-drawer{transition:none}}';
    document.head.appendChild(style);
    // Override the driver page's global full-width button rule for the drawer header.
    style.textContent += '.apk-settings-drawer [data-close]{width:44px;flex:0 0 44px;margin:0;box-sizing:border-box}.apk-settings-drawer h2{flex:1;min-width:0;text-align:left}.apk-settings-drawer [data-action]{width:100%;margin:0;box-sizing:border-box}';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    let closed = false;
    history.pushState({ ...history.state, driverSettingsOpen: true }, '');
    function finish(choice) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onBack);
      overlay.classList.remove('open');
      if (history.state?.driverSettingsOpen) history.back();
      setTimeout(() => {
        overlay.remove(); style.remove();
        document.body.style.overflow = previousOverflow;
        previousFocus?.focus();
        active = false;
        resolve(choice);
      }, 200);
    }
    function onBack() { finish(null); }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); finish(null); }
      if (event.key === 'Tab') {
        const controls = [...overlay.querySelectorAll('button')];
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    overlay.addEventListener('click', event => {
      const action = event.target.closest('[data-action]');
      if (action) finish(action.dataset.action);
      else if (event.target === overlay || event.target.closest('[data-close]')) finish(null);
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onBack);
    requestAnimationFrame(() => {
      if (closed) return;
      overlay.classList.add('open');
      overlay.querySelector('[data-close]').focus();
    });
  });
}
