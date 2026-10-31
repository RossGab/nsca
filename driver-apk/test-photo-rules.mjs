import assert from 'node:assert/strict';
import {photoPolicy,photoSlots,hasRequiredPhotos,renderPhotoButtons} from './photo-rules.mjs';
for(const JOBTYPE of ['CENCUS','meter census','DWOL_CeNcUs_2026']) {
  const task={JOBTYPE,_key:'task'};
  assert.deepEqual(photoSlots(task),[1,2,3,4,5]);
  const photos={};
  assert(!hasRequiredPhotos(task,photos,true));
  for(let i=1;i<=5;i++) {photos[i]={blob:new Blob(['photo'])};assert(hasRequiredPhotos(task,photos,true));}
  assert(!hasRequiredPhotos(task,{1:{blob:new Blob([])}},true));
  assert.equal(photoPolicy(task).required,1);
  assert.equal((renderPhotoButtons(task,{},false,x=>x).match(/data-photo-capture/g)||[]).length,5);
}
const normal={JOBTYPE:'DEX_2'};
assert.deepEqual(photoPolicy(normal),{census:false,slots:3,required:1});
assert(hasRequiredPhotos(normal,{1:{blob:new Blob(['photo'])}},true));
assert(!hasRequiredPhotos(normal,{}));
assert.equal((renderPhotoButtons(normal,{},false,x=>x).match(/data-photo-capture/g)||[]).length,3);
console.log('PASS: census jobs accept one through five photos; empty photos rejected; other jobs retain three slots and one-photo minimum.');
