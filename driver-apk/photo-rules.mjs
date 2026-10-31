export function photoPolicy(task) {
  const census=/cencus|census/i.test(String(task?.JOBTYPE || task?.jobType || ''));
  return {census,slots:census?5:3,required:1};
}
export function photoSlots(task) {return Array.from({length:photoPolicy(task).slots},(_,index)=>index+1);}
export function hasRequiredPhotos(task,photos,verifyBlobs=false) {
  const present=index=>!!photos[index] && (!verifyBlobs || photos[index].blob?.size>0);
  return photoSlots(task).some(present);
}
export function renderPhotoButtons(task,photos,busy,escape) {
  const rule=photoPolicy(task);
  const buttons=photoSlots(task).map(index=>{
    const disabled=busy || !!photos[index] || (index>1 && !photos[index-1]);
    return `<button data-photo-capture ${disabled?'disabled':''} onclick="startPhoto(${index},'${escape(task._key)}')">📸 Photo ${index}</button>`;
  }).join('');
  return `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px">${buttons}</div>`+
    (rule.census?'<p style="margin:8px 0;font-size:13px;color:#475569">Take up to 5 photos. At least 1 photo is needed to submit.</p>':'');
}
export function applyPhotoRules(source,path) {
  const old='    const previews = [1,2,3].map(i => {';
  if(!source.includes(old))throw Error('Photo preview integration point missing');
  source=source.replace(old,'    const previews = photoSlots(t).map(i => {');
  const start=source.indexOf('    const disable1 = PHOTO_CAPTURE_BUSY');
  const end=source.indexOf('<!-- 🔥 DELIVERY METHOD HERE -->',start);
  if(start<0 || end<0)throw Error('Photo button integration point missing');
  source=source.slice(0,start)+'    const disableSubmit = PHOTO_CAPTURE_BUSY || !hasRequiredPhotos(t,p);\n    html += renderPhotoButtons(t,p,PHOTO_CAPTURE_BUSY,escapeDeliveryHTML);\n    html += `\n        '+source.slice(end);
  const validation='  if (!photos || Object.keys(photos).length === 0) {\n    alert("Please take at least 1 photo.");';
  // Normalize newlines before matching the original validation.
  source=source.replaceAll('\r\n','\n');
  if(!source.includes(validation))throw Error('Photo validation integration point missing');
  source=source.replace(validation, '  const photoRuleTask = (await getTasksFromIndexedDB()).find(task => task._key === taskKey);\n  if (!photoRuleTask) throw new Error("Task could not be found. Refresh and try again.");\n  if (!hasRequiredPhotos(photoRuleTask,photos,true)) {\n    alert("Please take at least 1 photo.");');
  return `import {photoPolicy,photoSlots,hasRequiredPhotos,renderPhotoButtons} from ${JSON.stringify(path)};\n`+source;
}
