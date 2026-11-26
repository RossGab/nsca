import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('./upload-task.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('async function uploadTask('), html.indexOf('async function uploadData('));
let existing, writes;
const context = vm.createContext({
  doc: (...args) => args, firestore: {},
  getDoc: async () => ({ exists: () => existing !== null, data: () => existing }),
  safeId: value => String(value || '').trim(), exportData: {driverId:'JULIUS ROQUE'},
  buildUploadReceipt: () => null, serverTimestamp: () => 'server-time',
  updateDoc: async (_, payload) => writes.push(payload)
});
vm.runInContext(source, context);
const task = {_key:'TASK_1795662275242_125',driverId:'JULIUS ROQUE',deliveryData:{method:'Delivered'}};
const transferred = {agentId:'JOREEN BARNUEVO',driverId:'JOREEN BARNUEVO',lastTransferredFromAgentId:'JULIUS ROQUE',transferredAt:'2026-11-26',workStatus:'fordownload'};
async function run(data, options={}) { existing=data; writes=[]; return context.uploadTask(task, [], options); }
let result=await run({...transferred,deleted:true});
assert.equal(result.category,'deleted'); assert.match(result.reason,/recorded previous driver/); assert.equal(writes.length,0);
result=await run(transferred);
assert.equal(result.skipped,false); assert.match(result.details,/Assignment remains JOREEN/);
assert.equal(writes[0].completedBy,'JULIUS ROQUE'); assert.equal(writes[0].agentId,undefined); assert.equal(writes[0].driverId,undefined);
result=await run({...transferred,deleted:true},{restoreDeleted:true,restoredBy:'Admin'});
assert.equal(result.restored,true); assert.equal(writes[0].deleted,false);
result=await run({...transferred,lastTransferredFromAgentId:'OTHER'});
assert.equal(result.category,'driverMismatch'); assert.equal(writes.length,0);
result=await run({...transferred,transferredAt:null});
assert.equal(result.category,'driverMismatch');
result=await run({...transferred,deleted:true,lastTransferredFromAgentId:'OTHER'});
assert.equal(result.category,'deleted');
result=await run({...transferred,deleted:true,lastTransferredFromAgentId:'OTHER'},{restoreDeleted:true});
assert.equal(result.category,'driverMismatch'); assert.equal(writes.length,0);
result=await run({agentId:'JULIUS ROQUE'}); assert.equal(result.skipped,false);
result=await run({...transferred,status:'COMPLETED'}); assert.equal(result.category,'alreadyCompleted'); assert.equal(writes.length,0);
result=await run(null); assert.equal(result.category,'deleted'); assert.equal(writes.length,0);
console.log('Passed importer deletion, transfer, restoration, mismatch and duplicate checks.');
