import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('assign.html','utf8');
const load=html.slice(html.indexOf('async function loadTasks()'),html.indexOf('checkAll.onchange ='));
const overrides=html.slice(html.indexOf('function applyLoadOverrides('),html.indexOf('let SEARCH_TERM'));
const action=html.slice(html.indexOf('window.openBulkActions ='),html.indexOf('async function bulkRedownload('));
const row=(id,extras={})=>({_key:id,assignedDate:'2026-11-28',agentId:'A',...extras});
async function scenario({cached=null,full=true,fail=false}={}) {
 const published=[], queries=[]; let pages=0;
 const field=value=>({value,disabled:false,style:{}});
 const c={loadBtn:field(''),filterDateFrom:field('2026-11-28'),filterDateTo:field('2026-11-28'),checkAll:field(''),bulkBtn:field(''),loadingBar:field(''),loadingProgress:field(''),loadingText:field(''),SELECTED_IDS:new Set(),TASKS_VERIFIED:true,TASK_ACTION_BUSY:false,TASK_LOAD_IN_PROGRESS:false,LOAD_TASK_OVERRIDES:new Map(),TASK_MAP:{},window:{},
 document:{getElementById:()=>({innerHTML:''})},readTaskCache:async()=>cached,taskCacheNeedsFullRefresh:()=>full,
 publishLoadedTasks:tasks=>published.push({ids:tasks.map(t=>t._key),verified:c.TASKS_VERIFIED}),
 requestAnimationFrame:fn=>fn(),setTimeout:fn=>fn(),console:{error:()=>{}},alert:()=>{},
 excludeDeletedTasks:tasks=>tasks.filter(t=>!t.deleted),writeTaskCache:async()=>{},applyLoadOverrides:ts=>ts,
 loadLiveTasksFromFirebase:async()=>{pages++;if(fail&&pages===2)throw Error('network');return {tasks:[row(String(pages))],cursor:String(pages),hasMore:pages===1}},
 TASK_CACHE_OVERLAP_MS:0,FIRESTORE_PAGE_SIZE:500,Timestamp:{fromMillis:v=>v},getDocs:async()=>({docs:[{id:'updated',data:()=>row('updated')}]}),query:(...args)=>queries.push(args),collection:()=>{},where:(...args)=>args,orderBy:(...args)=>args,limit:n=>['limit',n],startAfter:v=>['cursor',v],db:{},mergeTaskUpdates:()=>[row('updated')]};
 vm.runInNewContext(load,c);await c.loadTasks();return {c,published,queries};
}
let r=await scenario();assert.deepEqual(r.published.map(x=>x.verified),[false,false,true]);
r=await scenario({cached:{tasks:[row('saved')],syncedAt:1},full:false});assert.equal(r.published[0].ids[0],'saved');assert.equal(r.published.at(-1).ids[0],'updated');
assert.ok(r.queries[0].some(x=>Array.isArray(x)&&x[0]==='assignedDate'&&x[2]==='2026-11-28'));
assert.ok(r.queries[0].some(x=>Array.isArray(x)&&x[0]==='limit'&&x[1]===500));
r=await scenario({fail:true});assert.match(r.c.loadingText.innerText,/incomplete/);assert.equal(r.c.loadBtn.disabled,false);
const helper=html.slice(html.indexOf('function publishLoadedTasks('),html.indexOf('/* ===== LOAD TASKS - FIRESTORE ONLY'));
const filter=()=>({value:'chosen',options:[],add(option){this.options.push(option)}});
const filters=Array.from({length:5},filter);
const c={window:{},excludeDeletedTasks:ts=>ts.filter(t=>!t.deleted),normalizeDate:v=>v,filterDateFrom:{value:'2026-11-28'},filterDateTo:{},filterDriver:filters[0],filterJob:filters[1],filterBA:filters[2],filterDMZ:filters[3],filterMRU:filters[4],TASK_MAP:{},TASK_ACTION_BUSY:false,TASK_LOAD_IN_PROGRESS:true,LOAD_TASK_OVERRIDES:new Map(),checkAll:{},loadBtn:{},buildFilterLists:()=>filters.forEach(f=>{f.value='';f.options=[]}),applyFilters:()=>{},Option:function(text,value){this.value=value}};
vm.createContext(c);
// Extract the two overlay functions without depending on neighbouring declarations.
vm.runInContext(html.slice(html.indexOf('function applyLoadOverrides('),html.indexOf('\n}',html.indexOf('function rememberLoadedTaskChanges('))+2),c);
vm.runInContext(helper,c);
const task=row('id',{customerName:'Customer'});
c.publishLoadedTasks([task,row('deleted',{deleted:true}),row('done',{status:'COMPLETED'})]);
const search=task._search;c.publishLoadedTasks([task]);assert.equal(task._search,search);assert.equal(c.window.__TASKS_DATA__.length,1);assert.ok(filters.every(f=>f.value==='chosen'));assert.equal(c.checkAll.disabled,false);
c.LOAD_TASK_OVERRIDES.set('id',null);c.publishLoadedTasks([task]);assert.equal(c.window.__TASKS_DATA__.length,0);
c.LOAD_TASK_OVERRIDES.set('id',row('id',{agentId:'NEW'}));c.publishLoadedTasks([task]);assert.equal(c.TASK_MAP.id.agentId,'NEW');
// Actions must work while the full loader is still running, using server reads.
c.LOAD_TASK_OVERRIDES.clear();c.TASK_MAP.id=task;c.SELECTED_IDS=new Set(['id']);c.nscaPrompt=async()=> 'DELETE';c.checkSelection=()=>{};c.console={log:()=>{},error:()=>{}};c.alert=()=>{};c.doc=(_,__,id)=>id;c.db={};c.getDocFromServer=async()=>({exists:()=>true,data:()=>task});
let deletes=0;c.bulkDelete=async()=>{deletes++};c.bulkTransfer=async()=>{};c.bulkRedownload=async()=>{};
vm.runInContext(action,c);await c.window.openBulkActions();assert.equal(deletes,1);assert.equal(c.TASK_ACTION_BUSY,false);assert.equal(c.loadBtn.disabled,true);
c.getDocFromServer=async()=>({exists:()=>true,data:()=>({...task,agentId:'CHANGED'})});await c.window.openBulkActions();assert.equal(deletes,1);assert.equal(c.SELECTED_IDS.size,0);
c.SELECTED_IDS.add('id');c.getDocFromServer=async()=>{throw Error('offline')};await c.window.openBulkActions();assert.equal(deletes,1);assert.equal(c.TASK_ACTION_BUSY,false);
console.log('Passed progressive display, scoped/paged queries, filters, action during loading, changed/offline task protection, and stale-batch override tests.');
