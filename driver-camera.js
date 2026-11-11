// Keep capture and review inside the PWA.
window.captureDriverPhoto = function () {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Take task photo');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100001;background:#111;color:#fff;display:flex;flex-direction:column;padding:16px;gap:12px;box-sizing:border-box';
    overlay.innerHTML = '<p role="status">Starting camera...</p><video autoplay muted playsinline style="width:100%;flex:1;min-height:0;object-fit:contain"></video><div data-review hidden style="flex:1;min-height:0"></div><div style="display:flex;gap:12px;flex-wrap:wrap"><button type="button" data-shutter disabled>Take photo</button><button type="button" data-cancel>Cancel</button><button type="button" data-native hidden>Open phone camera</button></div>';
    const video = overlay.querySelector('video'), status = overlay.querySelector('p');
    const review = overlay.querySelector('[data-review]');
    const shutter = overlay.querySelector('[data-shutter]');
    const native = overlay.querySelector('[data-native]');
    const previousFocus = document.activeElement;
    let stream, done = false, timer, reviewFile, reviewURL;
    function stop() {
      if (stream) stream.getTracks().forEach(track => track.stop());
      stream = null;
      video.srcObject = null;
    }
    function clearReview(releasePixels = true) {
      if (reviewURL) URL.revokeObjectURL(reviewURL);
      reviewURL = null;
      if (releasePixels && reviewFile instanceof HTMLCanvasElement) reviewFile.width = reviewFile.height = 0;
      reviewFile = null;
      review.replaceChildren();
    }
    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer); stop(); clearReview(!result?.file);
      document.removeEventListener('visibilitychange', onHidden);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onPageHide);
      overlay.remove(); previousFocus?.focus(); resolve(result);
    }
    function onHidden() { if (document.hidden) finish(null); }
    function onPageHide() { finish(null); }
    function onKey(event) {
      if (event.key === 'Escape') finish(null);
      if (event.key === 'Tab') {
        const buttons = [...overlay.querySelectorAll('button')].filter(b => !b.hidden && !b.disabled);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    function unavailable() {
      if (done) return;
      clearTimeout(timer); stop(); shutter.disabled = true;
      status.textContent = 'Camera unavailable. Allow camera access and retry, or open the phone camera.';
      native.hidden = false;
    }
    async function start() {
      clearReview(); video.hidden = false; review.hidden = true;
      shutter.hidden = false; shutter.disabled = true; native.hidden = true;
      status.textContent = 'Starting camera...';
      timer = setTimeout(unavailable, 20000);
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({audio:false, video:{
          facingMode:{ideal:'environment'}, width:{ideal:2560,max:2560},
          height:{ideal:1440,max:2560}, frameRate:{ideal:15,max:15}
        }});
        if (done || !native.hidden) { acquired.getTracks().forEach(t => t.stop()); return; }
        stream = acquired;
        const track = stream.getVideoTracks()[0];
        // Focus support varies by phone; failure must not block capture.
        try {
          if (track.getCapabilities?.().focusMode?.includes('continuous')) {
            await track.applyConstraints({advanced:[{focusMode:'continuous'}]});
          }
        } catch (_) {}
        if (done) return;
        video.srcObject = stream; await video.play();
        await new Promise(resolveFrame => {
          if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(resolveFrame);
          else if (video.readyState >= 2) resolveFrame();
          else video.addEventListener('loadeddata', resolveFrame, {once:true});
        });
        if (done || !native.hidden) return;
        clearTimeout(timer);
        status.textContent = 'Hold steady and check the focus, then tap Take photo.';
        shutter.disabled = false;
      } catch (_) { unavailable(); }
    }
    shutter.onclick = async () => {
      if (done || shutter.disabled || !video.videoWidth || !video.videoHeight) return;
      shutter.disabled = true; status.textContent = 'Taking photo...';
      let file;
      try {
        const track = stream.getVideoTracks()[0];
        if (typeof window.ImageCapture === 'function') {
          let timeout;
          try {
            file = await Promise.race([
              new window.ImageCapture(track).takePhoto(),
              new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Still capture timed out')), 5000); })
            ]);
            if (!file?.size) file = null;
          } catch (_) { /* Fall back to a video frame when still capture is unsupported. */ }
          finally { clearTimeout(timeout); }
        }
        if (done) return;
        if (!file) {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas unavailable');
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          file = canvas;
        }
        finish({file});
      } catch (_) { unavailable(); }
    };
    overlay.querySelector('[data-cancel]').onclick = () => finish(null);
    native.onclick = () => finish({native:true});
    document.body.append(overlay); overlay.querySelector('[data-cancel]').focus();
    document.addEventListener('visibilitychange', onHidden);
    document.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onPageHide);
    if (navigator.mediaDevices?.getUserMedia) start(); else unavailable();
  });
};
