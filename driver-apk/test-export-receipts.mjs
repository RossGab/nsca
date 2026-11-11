import assert from 'node:assert/strict';
import { prepareExportReceipt, buildUploadReceipt, matchesUploadReceipt } from '../offline-export-receipts.js';
import { createReceiptChecker } from '../driver-export-confirmation.js';

const task = { _key:'one', driverId:'driver_001', status:'LOCAL_COMPLETED', exported:true };
const photos = [1,5].map(photoIndex => ({ photoIndex, blobSize:123, takenAt:'2026-11-11' }));
task.offlineExport = prepareExportReceipt(task,photos);
assert.equal(prepareExportReceipt(task,photos).id,task.offlineExport.id,'Retry reuses identity');
assert.notEqual(prepareExportReceipt(task,[{...photos[0],takenAt:'later'},photos[1]]).id,task.offlineExport.id);
const receipt = buildUploadReceipt(task,photos,'server-time');
const server = {status:'COMPLETED',workStatus:'completed',offlineExportReceipt:receipt,photo1Url:'https://photo/1',photo5Url:'https://photo/5'};
assert(matchesUploadReceipt(task,server));
for (const changed of [
  {...server,deleted:true}, {...server,status:'PENDING'}, {...server,photo5Url:''},
  {...server,offlineExportReceipt:{...receipt,id:'old'}},
  {...server,offlineExportReceipt:{...receipt,driverId:'other'}},
  {...server,offlineExportReceipt:{...receipt,photoIndices:[1]}}
]) assert(!matchesUploadReceipt(task,changed));
assert(!matchesUploadReceipt({...task,offlineExport:null},server));
assert.equal(buildUploadReceipt({...task,offlineExport:null},photos,'now'),null);
assert.throws(()=>buildUploadReceipt(task,[photos[0]],'now'));

let online=true;
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{get onLine(){return online;}}});
for(const mode of ['confirmed','offline','read-failed','wrong-receipt','changed-local']) {
  let local=[structuredClone(task)], saves=0, reads=0;
  online=mode!=='offline';
  const checker=createReceiptChecker({driverId:()=>task.driverId,isBusy:()=>false,
    getTasks:async()=>local,saveTasks:async updates=>{saves++;local=updates;},render:()=>{},
    readServer:async()=>{reads++;if(mode==='read-failed')throw Error('offline');
      if(mode==='changed-local')local[0].offlineExport={...local[0].offlineExport,id:'newer'};
      return mode==='wrong-receipt'?{...server,offlineExportReceipt:{...receipt,id:'wrong'}}:server;}
  });
  await checker(local);
  assert.equal(saves,mode==='confirmed'?1:0,mode);
  if(mode==='offline')assert.equal(reads,0);
  if(mode==='confirmed')assert.equal(local[0].offlineExportConfirmed.id,task.offlineExport.id);
}
console.log('PASS: unique/retry receipts, photo/owner/status matching, legacy imports, offline/read failure, and stale-local protection.');
