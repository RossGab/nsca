// APK only: Capacitor routes the capture-enabled input to Android's camera app.
// The task page handles the returned full-size file and cancellation.
window.captureDriverPhoto = async function () {
  return { native: true };
};
