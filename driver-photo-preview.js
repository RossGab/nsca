// Fit full task photos to the screen; browser/PWA Back dismisses the preview.
let activePreview;
window.openDriverPhoto = function (url, onRetake) {
  if (!url || activePreview) return;
  const previousFocus = document.activeElement;
  const previousOverflow = document.body.style.overflow;
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Full photo');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100010;background:#111;display:flex;flex-direction:column;padding:16px;gap:12px;box-sizing:border-box;';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = '← Back to task';
  back.style.cssText = 'flex:0 0 auto;align-self:flex-start;width:auto;min-height:48px;margin:0;padding:10px 18px;background:#fff;color:#172033;border:0;border-radius:10px;font-size:16px;';
  const photo = document.createElement('img');
  photo.alt = 'Captured task photo';
  photo.style.cssText = 'display:block;flex:1 1 0;width:100%;height:0;min-height:0;max-width:100%;max-height:none;object-fit:contain;object-position:center;margin:0;padding:0;border:0;border-radius:0;transform:none;';
  photo.src = url;
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;flex:0 0 auto';
  actions.append(back);
  let afterClose;
  if (typeof onRetake === 'function') {
    const retake = document.createElement('button');
    retake.type = 'button'; retake.textContent = 'Retake photo';
    retake.style.cssText = back.style.cssText;
    retake.onclick = () => { afterClose = onRetake; close(); };
    actions.append(retake);
  }
  overlay.append(actions, photo);
  function cleanup() {
    if (activePreview !== cleanup) return;
    activePreview = null;
    window.removeEventListener('popstate', cleanup);
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    if (previousFocus?.isConnected) previousFocus.focus();
    if (afterClose) afterClose();
  }
  function close() {
    if (history.state?.driverPhotoPreview) history.back();
    else cleanup();
  }
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const buttons = [...actions.querySelectorAll('button')];
      const first = buttons[0], last = buttons[buttons.length-1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  back.onclick = close;
  activePreview = cleanup;
  history.pushState({ ...history.state, driverPhotoPreview: true }, '');
  window.addEventListener('popstate', cleanup);
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.append(overlay);
  back.focus();
};
