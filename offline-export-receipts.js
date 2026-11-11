const owner = value => String(value || '').trim().toUpperCase();
export function photoIndices(photos) {
  return [...new Set(photos.map(p => Number(p.photoIndex)))].sort((a,b) => a-b);
}
const equalIndices = (a,b) => Array.isArray(a) && Array.isArray(b) && a.length > 0 &&
  a.length === b.length && a.every((n,i) => Number.isInteger(n) && n > 0 && n === b[i]);
export function prepareExportReceipt(task, photos) {
  const indices = photoIndices(photos);
  if (!indices.length || indices.some(i => !Number.isInteger(i) || i < 1 || i > 5)) {
    throw new Error('Missing or invalid photos for task ' + task._key);
  }
  const previous = task.offlineExport;
  const photoSignature = JSON.stringify([...photos].sort((a,b) => a.photoIndex-b.photoIndex)
    .map(p => [Number(p.photoIndex), Number(p.blobSize) || 0, p.takenAt || '', p.sha256 || '']));
  if (previous?.id && previous.photoSignature === photoSignature && equalIndices(previous.photoIndices, indices)) return previous;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return { id: Array.from(bytes, b => b.toString(16).padStart(2,'0')).join(''), photoIndices:indices, photoSignature };
}
export function buildUploadReceipt(task, photos, uploadedAt) {
  if (!task.offlineExport) return null; // Older exports remain importable.
  const receipt = task.offlineExport;
  if (typeof receipt.id !== 'string' || !/^[a-f0-9]{32}$/.test(receipt.id) ||
      !equalIndices(receipt.photoIndices, photoIndices(photos))) {
    throw new Error('Export receipt does not match photos for task ' + task._key);
  }
  return { id:receipt.id, photoIndices:receipt.photoIndices, driverId:task.driverId, uploadedAt };
}
export function matchesUploadReceipt(task, server) {
  const expected = task.offlineExport, received = server?.offlineExportReceipt;
  return Boolean(expected?.id && received?.id === expected.id && server.deleted !== true &&
    server.status === 'COMPLETED' && server.workStatus === 'completed' &&
    owner(received.driverId) === owner(task.driverId) &&
    equalIndices(expected.photoIndices, received.photoIndices) &&
    expected.photoIndices.every(i => typeof server['photo'+i+'Url'] === 'string' && server['photo'+i+'Url'].trim()));
}
