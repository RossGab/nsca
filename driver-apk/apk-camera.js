// Keep capture in the page so opening the camera does not background the PWA.
window.captureDriverPhoto = function () {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Take task photo");
    overlay.style.cssText = "position:fixed;inset:0;z-index:100001;background:#111;color:white;display:flex;flex-direction:column;padding:16px;gap:12px";
    overlay.innerHTML = '<p role="status">Starting camera...</p><video autoplay muted playsinline style="width:100%;flex:1;min-height:0;object-fit:contain"></video><div style="display:flex;gap:12px;flex-wrap:wrap"><button type="button" data-shutter disabled>Take photo</button><button type="button" data-cancel>Cancel</button><button type="button" data-native hidden>Open phone camera</button></div>';
    const video = overlay.querySelector("video");
    video.muted = true;
    video.defaultMuted = true;
    video.controls = false;
    video.setAttribute("webkit-playsinline", "");
    // Do not expose WebView's oversized play poster before the first camera frame.
    video.style.visibility = "hidden";
    const status = overlay.querySelector("p");
    const shutter = overlay.querySelector("[data-shutter]");
    const native = overlay.querySelector("[data-native]");
    const previousFocus = document.activeElement;
    let stream, done = false, timer;
    function stop() {
      video.style.visibility = "hidden";
      video.pause();
      if (stream) stream.getTracks().forEach(track => track.stop());
      stream = null;
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }
    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      document.removeEventListener("visibilitychange", onHidden);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("pagehide", onHidden);
      overlay.remove();
      previousFocus?.focus();
      resolve(result);
    }
    function onHidden() {
      if (document.hidden) finish(null);
    }
    function onKey(event) {
      if (event.key === "Escape") finish(null);
      if (event.key === "Tab") {
        const buttons = [...overlay.querySelectorAll("button")].filter(button => !button.hidden && !button.disabled);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    function unavailable() {
      if (done) return;
      clearTimeout(timer);
      stop();
      shutter.disabled = true;
      status.textContent = "Camera could not start. Check Driver WIP camera permission in Android settings and retry, or open the phone camera.";
      native.hidden = false;
    }
    overlay.querySelector("[data-cancel]").onclick = () => finish(null);
    native.onclick = () => finish({ native: true });
    shutter.onclick = () => {
      if (done || !video.videoWidth || !video.videoHeight) return;
      shutter.disabled = true;
      const canvas = document.createElement("canvas");
      try {
        const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        stop();
        status.textContent = "Preparing photo...";
        canvas.toBlob(blob => {
          canvas.width = canvas.height = 0;
          if (done) return;
          if (blob?.size) finish({ file: blob });
          else unavailable();
        }, "image/jpeg", 0.85);
      } catch (_) {
        canvas.width = canvas.height = 0;
        unavailable();
      }
    };
    document.body.appendChild(overlay);
    overlay.querySelector("[data-cancel]").focus();
    document.addEventListener("visibilitychange", onHidden);
    document.addEventListener("keydown", onKey);
    window.addEventListener("pagehide", onHidden);
    timer = setTimeout(unavailable, 20000);
    if (!navigator.mediaDevices?.getUserMedia) { unavailable(); return; }
    // Give Android a moment to release the previous camera before reopening it.
    new Promise(resolve => setTimeout(resolve, 250)).then(() => {
      if (done) return null;
      return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 1280 },
        frameRate: { ideal: 15, max: 15 }
      }
      });
    }).then(async acquired => {
      if (!acquired) return;
      // A permission request may finish after cancellation or timeout.
      if (done || !native.hidden) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream = acquired;
      video.srcObject = stream;
      try {
        await video.play();
        await new Promise(resolve => {
          if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(resolve);
          else if (video.readyState >= 2 && video.videoWidth) resolve();
          else video.addEventListener("loadeddata", resolve, { once: true });
        });
        if (done || !native.hidden || !video.videoWidth || !video.videoHeight) return;
        clearTimeout(timer);
        video.style.visibility = "visible";
        status.textContent = "Position the photo, then tap Take photo.";
        shutter.disabled = false;
      } catch (_) { unavailable(); }
    }).catch(unavailable);
  });
};
