const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('admin-complete-task.html', 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const logic = script.slice(script.indexOf('function owner('), script.indexOf('async function boot('));
function fixture(latest = {}) {
  const task = {status:'PENDING',driverId:'driver-1',agentId:'driver-1',JOBTYPE:'BILLING'};
  const state = {task,method:'Delivered',radio:'received',methods:{Delivered:{_order:['reading','received'],fields:{reading:{required:true,numbersOnly:true,label:'Reading'},received:{type:'radio',fields:{_order:['recipient'],options:{recipient:{required:true,label:'Recipient'}}}}}}},values:{reading:'123',recipient:'Customer'},photos:new Map([[1,{type:'image/jpeg'}]]),busy:false};
  const elements = {controls:{disabled:false}};
  const writes = [], deleted = [];
  let reads = 0;
  const context = {requestSubmissionPassword:async()=> 'CompleteTask',state,taskId:'task-1',firestore:{},storage:{},syncVisible(){},statusBox:{},$:id=>elements[id],window:{nscaConfirm:async()=>true},crypto:{randomUUID:()=> 'submission-1'},doc:()=>({}),getDoc:async()=>({exists:()=>true,data:()=>task}),storageRef:(_,path)=>path,uploadBytes:async()=>{},getDownloadURL:async()=> 'https://example.com/photo.jpg',deleteObject:async path=>deleted.push(path),serverTimestamp:()=> 'SERVER_TIME',runTransaction:async(_,fn)=>fn({get:async()=>{reads++;return {exists:()=>true,data:()=>({...task,...latest})}},update:(_,payload)=>writes.push(payload)}),console};
  vm.createContext(context);vm.runInContext(logic,context);
  return {context,state,elements,writes,deleted,get reads(){return reads}};
}
(async()=>{
  const dashboard=fs.readFileSync('admin.html','utf8');
  const dashboardStatus=dashboard.slice(dashboard.indexOf('function getAdminEffectiveStatus('),dashboard.indexOf('function normalizeAdminCachedTask('));
  const statusContext={};vm.createContext(statusContext);vm.runInContext(dashboardStatus,statusContext);
  for(const status of [undefined,'','OPEN',' open ','PENDING',' pending ','COMPLETED','CANCELLED']){
    for(const workStatus of [undefined,'fordownload','pending','completed',' COMPLETED ']){
      const sample={status,workStatus},test=fixture();
      assert.equal(test.context.effectiveStatus(sample),statusContext.getAdminEffectiveStatus(sample));
      const candidate={...test.state.task,...sample};
      if(statusContext.getAdminEffectiveStatus(sample)==='PENDING') assert.doesNotThrow(()=>test.context.checkPending(candidate));
      else assert.throws(()=>test.context.checkPending(candidate));
    }
  }
  for(const status of ['OPEN',' open ',undefined,' pending ']){
    const legacy=fixture({status,workStatus:'fordownload'});
    legacy.state.task.status=status;legacy.state.task.workStatus='fordownload';
    await legacy.context.submit({preventDefault(){}});assert.equal(legacy.writes.length,1);
  }
  for(const password of ['wrong','completetask','',null]){
    const denied=fixture();denied.context.requestSubmissionPassword=async()=>password;
    denied.context.getDoc=async()=>{throw new Error('Must not access task before password approval')};
    await denied.context.submit({preventDefault(){}});
    assert.equal(denied.writes.length,0);assert.equal(denied.deleted.length,0);assert.equal(denied.reads,0);
    assert.equal(denied.state.busy,false);
    if(password!==null)assert.match(denied.context.statusBox.textContent,/Incorrect submission password/);
  }
  const ok=fixture();await ok.context.submit({preventDefault(){}});
  assert.equal(ok.writes.length,1);
  const payload=ok.writes[0];
  assert.equal(payload.status,'COMPLETED');assert.equal(payload.completedBy,'Admin');
  assert.equal(payload.completionOnBehalfOf,'driver-1');assert.equal(payload.completionSource,'admin');
  assert.equal(payload.completedAt,'SERVER_TIME');assert.equal(payload.recipient,'Customer');
  for(const key of ['driverId','agentId','AGENTID']) assert.ok(!(key in payload));
  assert.ok(!('photo1TakenAt' in payload));assert.ok(!('photo1GPS' in payload));
  assert.equal(ok.deleted.length,0);assert.equal(ok.elements.controls.disabled,true);
  for(const latest of [{status:'COMPLETED'},{status:'PENDING',workStatus:'completed'},{driverId:'driver-2'},{agentId:'driver-2'},{JOBTYPE:'OTHER'},{deleted:true}]){
    const conflict=fixture(latest);await conflict.context.submit({preventDefault(){}});
    assert.equal(conflict.writes.length,0);assert.equal(conflict.deleted.length,1);assert.equal(conflict.elements.controls.disabled,false);
  }
  for(const values of [{reading:'',recipient:'Customer'},{reading:'abc',recipient:'Customer'},{reading:'1',recipient:''}]){
    const invalid=fixture();invalid.state.values=values;assert.throws(()=>invalid.context.deliveryAnswers());
  }
  const noPhoto=fixture();noPhoto.state.photos.clear();await noPhoto.context.submit({preventDefault(){}});assert.equal(noPhoto.writes.length,0);
  const uploadFailure=fixture();uploadFailure.context.uploadBytes=async()=>{throw new Error('Upload failed')};
  await uploadFailure.context.submit({preventDefault(){}});assert.equal(uploadFailure.writes.length,0);assert.equal(uploadFailure.deleted.length,1);
  const cancelled=fixture();cancelled.context.window.nscaConfirm=async()=>false;
  await cancelled.context.submit({preventDefault(){}});assert.equal(cancelled.writes.length,0);assert.equal(cancelled.state.busy,false);
  const stale=fixture();stale.state.values.unselectedAnswer='old';assert.ok(!('unselectedAnswer' in stale.context.deliveryAnswers()));
  const protectedField=fixture();protectedField.state.methods.Delivered._order.push('driverId');protectedField.state.methods.Delivered.fields.driverId={};assert.throws(()=>protectedField.context.deliveryAnswers());
  const driver=fs.readFileSync('driver.html','utf8');
  const transaction=driver.match(/await runTransaction\(firestore, async transaction => \{([\s\S]*?)\n    \}\);/)[1];
  for(const current of [{status:'COMPLETED',completionSource:'admin',driverId:'driver-1'},{status:'PENDING',driverId:'driver-2'}]){
    let wrote=false;
    await assert.rejects(vm.runInNewContext(`(async()=>{${transaction}})()`,{transaction:{get:async()=>({exists:()=>true,data:()=>current}),update:()=>{wrote=true}},taskRef:{},updatePayload:{},DRIVER_ID:'driver-1'}));
    assert.equal(wrote,false);
  }
  console.log('Passed: admin completion, owner preservation, audit fields, concurrent completion/reassignment, failed-upload cleanup, required/numeric answers, photo requirement, protected fields, and driver overwrite protection.');
})().catch(error=>{console.error(error);process.exitCode=1});
