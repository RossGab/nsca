import { registerPlugin, Capacitor } from '@capacitor/core';
const camera = registerPlugin('DriverCamera');

window.captureDriverPhoto = async () => {
  const result = await camera.capture();
  return result.cancelled ? null : { file: { nativeCameraPath: result.path } };
};

export async function processNativePhoto(file, gps, takenAt) {
  if (!file?.nativeCameraPath) throw new Error('Please take the photo again with the phone camera.');
  let output;
  try {
    output = await camera.process({ path: file.nativeCameraPath,
      latitude: gps.latitude, longitude: gps.longitude, takenAt });
    const response = await fetch(Capacitor.convertFileSrc(output.path));
    if (!response.ok) throw new Error('Unable to read processed photo.');
    const blob = await response.blob();
    if (!blob.size) throw new Error('The processed photo is empty. Please retake it.');
    await camera.release({ path: file.nativeCameraPath });
    return blob;
  } finally {
    if (output?.path) await camera.release({ path: output.path }).catch(() => {});
  }
}
