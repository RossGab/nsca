import assert from 'node:assert/strict';
import { migrate } from './native-storage.mjs';
const blob=new Blob(['photo bytes'],{type:'image/jpeg'});
const original={tasks:[{_key:'a',dateKey:'20261031',status:'LOCAL_COMPLETED'}],photos:[{id:'a_1',taskKey:'a',photoIndex:1,submitIntent:true,blob}],prefs:{driverId:'driver_001',driverFormCache:'{"a":{"notes":"saved"}}'}};
function fixture(failOperation) {
  let failure=failOperation;
  const stores={tasks:new Map(),photos:new Map(),prefs:new Map(),meta:new Map()};
  let calls=[];
  const request=async options=>{
    calls.push(options.operation);
    if(options.operation===failure) throw new Error('Simulated disk failure');
    const table=stores[options.store];
    if(options.operation==='get') return {row:table.get(options.id)};
    if(options.operation==='resetMigration') {for(const map of Object.values(stores))map.clear();return {};}
    if(options.operation==='write') { for(const row of options.rows)table.set(row._key || row.key,structuredClone(row));return {}; }
    if(options.operation==='putPhoto') {const row={...options.row,nativeFile:'test.bin',sha256:'hash',blobSize:blob.size};stores.photos.set(row.id,row);return {row};}
    if(options.operation==='checkPhoto') return {sha256:'hash'};
    if(options.operation==='completeMigration') {assert.equal(stores.tasks.size,options.tasks);assert.equal(stores.photos.size,options.photos);stores.meta.set('migration-v1',{complete:true});return {};}
    throw new Error('Unknown operation');
  };
  const args={request,legacy:{tasks:async()=>original.tasks,photoIds:async()=>original.photos.map(p=>p.id),photo:async id=>original.photos.find(p=>p.id===id)},preferences:{getItem:key=>original.prefs[key]??null},encode:async()=> 'encoded',digest:async()=> 'hash'};
  return {stores,args,calls,recover(){failure=null;}};
}
{
  const fixture1=fixture(); assert.equal(await migrate(fixture1.args),true);
  assert.equal(fixture1.stores.prefs.get('driverId').value,'driver_001');
  assert.equal(fixture1.stores.photos.get('a_1').submitIntent,true);
  const before=fixture1.calls.length; assert.equal(await migrate(fixture1.args),false);
  assert.deepEqual(fixture1.calls.slice(before),['get']);
}
for(const operation of ['write','putPhoto','checkPhoto','completeMigration']) {
  const failed=fixture(operation);
  await assert.rejects(migrate(failed.args),/Simulated disk failure/);
  assert.equal(failed.stores.meta.has('migration-v1'),false);
  assert.equal(original.tasks.length,1);assert.equal(original.photos[0].blob,blob);
  failed.recover();
  assert.equal(await migrate(failed.args),true);
  assert.equal(failed.stores.meta.get('migration-v1').complete,true);
}
{
  const corrupt=fixture();const request=corrupt.args.request;
  corrupt.args.request=async options=>options.operation==='checkPhoto'?{sha256:'wrong'}:request(options);
  await assert.rejects(migrate(corrupt.args),/did not match/);
  assert.equal(corrupt.stores.meta.size,0);
}
{
  const empty=fixture();
  empty.args.legacy={tasks:async()=>[],photoIds:async()=>[]};
  empty.args.preferences={getItem:()=>null};
  assert.equal(await migrate(empty.args),true);
  assert.equal(empty.stores.tasks.size,0);
}
console.log('PASS: migration verification, settings/photo preservation, failure without activation, retry, corrupt-photo rejection, completed-migration idempotence.');
