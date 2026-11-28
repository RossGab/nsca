import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {isManageTaskActive,projectManageTask}=require('./functions/manage-task-data.js');
assert.equal(isManageTaskActive({}),false);
assert.equal(isManageTaskActive({status:'PENDING'}),true);
assert.equal(isManageTaskActive({workStatus:'for download'}),true);
assert.equal(isManageTaskActive({workStatus:'fordownload',ba:'ANY BA'}),true);
assert.equal(isManageTaskActive({status:'PENDING',workStatus:'cancelled'}),false);
assert.equal(isManageTaskActive({status:'COMPLETED',workStatus:'pending'}),false);
assert.equal(isManageTaskActive({workStatus:'pending'}),true);
assert.equal(isManageTaskActive({status:' completed '}),false);
assert.equal(isManageTaskActive({workStatus:'Completed'}),false);
assert.equal(isManageTaskActive({deleted:true}),false);
const projected=projectManageTask({_key:'id',customerName:'Name',photo1Url:'large',deliveryData:{answer:'hidden'},createdAt:{_seconds:100}});
assert.equal(projected.photo1Url,undefined);assert.equal(projected.deliveryData,undefined);assert.equal(projected.createdAt,new Date(100000).toISOString());
const source=readFileSync('functions/index.js','utf8');
const start=source.indexOf('exports.prepareAdminAssignedTasks =');const end=source.indexOf('function csvReportValue',start);
let refreshes=0,loads=0;
const rows=Array.from({length:1002},(_,i)=>({_key:String(i),assignedDate:'2026-11-28',customerName:'Customer',workStatus:i%2?'pending':'fordownload',ba:i%2?'BA1':'BA2'}));
rows.push({_key:'completed',status:'COMPLETED'},{_key:'deleted',deleted:true});
const c={exports:{},onRequest:(_,fn)=>fn,setReportCors:()=>true,assignedDateBounds:()=>true,ADMIN_ASSIGNED_MAX_DAYS:180,
 getFirestore:()=>({}),REPORT_DATABASE_ID:'test',snapshotDateIsEligible:()=>false,isManageTaskActive,projectManageTask,
 refreshAssignedSnapshotForDate:async()=>{refreshes++;return {tasks:rows,source:'snapshot',snapshotWatermark:123,estimatedDocumentReads:1004}},
 loadAssignedSnapshotTasks:async(date,watermark)=>{loads++;assert.equal(watermark,123);return rows},console};
vm.runInNewContext(source.slice(start,end),c);
async function request(body){const res={code:200,status(code){this.code=code;return this},json(data){this.data=data},end(){}};await c.exports.prepareAdminAssignedTasks({method:'POST',body:{from:'2026-11-28',to:'2026-11-28',...body}},res);return res}
let r=await request({purpose:'manage-tasks-v1',pageSize:1000});assert.equal(r.code,200);assert.equal(r.data.tasks.length,1000);assert.equal(r.data.hasMore,true);assert.equal(r.data.snapshotWatermark,123);
r=await request({purpose:'manage-tasks-v1',pageSize:1000,offset:1000,reuseSnapshot:true,snapshotWatermark:123});assert.equal(r.data.tasks.length,2);assert.equal(r.data.hasMore,false);assert.equal(refreshes,1);assert.equal(loads,1);assert.equal(r.data.dateStats[0].estimatedDocumentReads,0);
r=await request({});assert.equal(r.code,400); // Existing admin mode still requires BA scope.
const html=readFileSync('assign.html','utf8');
const loader=html.slice(html.indexOf('async function loadLiveTasksFromFirebase('),html.indexOf('// Index only the arriving batch'));
let posted;
const l={FIRESTORE_PAGE_SIZE:1000,ASSIGN_SNAPSHOT_WATERMARKS:new Map(),ASSIGN_LOAD_STATS:{},fetch:async(_,options)=>{posted=JSON.parse(options.body);return {ok:true,json:async()=>({purpose:'manage-tasks-v1',tasks:[{_key:'id'}],nextOffset:1,hasMore:false,snapshotWatermark:123,dateStats:[]})}}};
vm.runInNewContext(loader,l);await l.loadLiveTasksFromFirebase('20261128');assert.equal(posted.pageSize,1000);assert.equal(posted.purpose,'manage-tasks-v1');
l.fetch=async()=>({ok:false,json:async()=>({error:'deploy backend'})});await assert.rejects(l.loadLiveTasksFromFirebase('20261128'),/deploy backend/);
const append=html.slice(html.indexOf('function appendLoadedTaskBatch('),html.indexOf('// Publish partial results'));
const select=()=>({options:[],add(option){this.options.push(option)}});
const a={isManageTaskActive,window:{__TASKS_DATA__:[],__TASKS_BY_DATE__:{},__TASKS_BY_DRIVER__:{},__TASKS_BY_JOB__:{}},TASK_MAP:{},LOAD_TASK_OVERRIDES:new Map(),TASK_ACTION_BUSY:false,ASSIGN_LOAD_STATS:null,normalizeDate:x=>x,filterDateFrom:{value:'2026-11-28'},filterDriver:select(),filterJob:select(),filterBA:select(),filterDMZ:select(),filterMRU:select(),checkAll:{},Option:function(text,value){this.value=value},applyFilters:()=>{}};
vm.runInNewContext(append,a);const one={_key:'one',assignedDate:'2026-11-28',customerName:'One',agentId:'A',workStatus:'pending'};
a.appendLoadedTaskBatch([one]);const search=one._search;
Object.defineProperty(one,'_search',{get:()=>search,set:()=>{throw Error('Existing task reindexed')}});
a.appendLoadedTaskBatch([{_key:'two',agentId:'B',workStatus:'fordownload'}]);assert.equal(a.window.__TASKS_DATA__.length,2);
a.LOAD_TASK_OVERRIDES.set('deleted',null);a.appendLoadedTaskBatch([{_key:'deleted'}]);assert.equal(a.window.__TASKS_DATA__.length,2);
console.log('Passed server active/legacy filtering, light projection, 1000-item paging, snapshot reuse, unchanged admin scope, no costly fallback, and indexing new tasks only.');
