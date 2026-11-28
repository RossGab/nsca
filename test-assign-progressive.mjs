import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('assign.html','utf8');
const load=html.slice(html.indexOf('async function loadTasks()'),html.indexOf('checkAll.onchange ='));
async function scenario({cached=null,full=true,fail=false}={}) {
 const published=[]; let pages=0;
 const field=value=>({value,disabled:false,style:{}});
 const c={loadBtn:field(''),filterDateFrom:field('2026-11-28'),filterDateTo:field('2026-11-28'),checkAll:field(''),bulkBtn:field(''),loadingBar:field(''),loadingProgress:field(''),loadingText:field(''),SELECTED_IDS:new Set(),TASKS_VERIFIED:true,
 document:{getElementById:()=>({innerHTML:''})},readTaskCache:async()=>cached,taskCacheNeedsFullRefresh:()=>full,
 publishLoadedTasks:tasks=>published.push({ids:tasks.map(t=>t._key),verified:c.TASKS_VERIFIED}),
 requestAnimationFrame:fn=>fn(),setTimeout:fn=>fn(),console:{error:()=>{}},alert:()=>{},
 excludeDeletedTasks:tasks=>tasks.filter(t=>!t.deleted),writeTaskCache:async()=>{},
 loadLiveTasksFromFirebase:async()=>{pages++;if(fail&&pages===2)throw Error('network');return {tasks:[{_key:String(pages)}],cursor:String(pages),hasMore:pages===1}},
 TASK_CACHE_OVERLAP_MS:0,Timestamp:{fromMillis:v=>v},getDocs:async()=>({forEach:fn=>fn({id:'updated',data:()=>({})})}),query:()=>{},collection:()=>{},where:()=>{},orderBy:()=>{},db:{},mergeTaskUpdates:()=>[{_key:'updated'}]};
 vm.runInNewContext(load,c);await c.loadTasks();return {c,published};
}
let r=await scenario();assert.deepEqual(r.published.map(x=>x.verified),[false,false,true]);assert.equal(r.published[0].ids.length,1);assert.equal(r.published[1].ids.length,2);
r=await scenario({cached:{tasks:[{_key:'saved'}],syncedAt:1},full:false});assert.equal(r.published[0].ids[0],'saved');assert.equal(r.published[0].verified,false);assert.equal(r.published.at(-1).ids[0],'updated');assert.equal(r.c.TASKS_VERIFIED,true);
r=await scenario({fail:true});assert.equal(r.c.TASKS_VERIFIED,false);assert.equal(r.c.bulkBtn.disabled,true);assert.match(r.c.loadingText.innerText,/incomplete/);assert.equal(r.c.loadBtn.disabled,false);
console.log('Passed progressive batches, cached-first updates, and failed-load action lock checks.');
const helper=html.slice(html.indexOf('function publishLoadedTasks('),html.indexOf('/* ===== LOAD TASKS - FIRESTORE ONLY'));
const filter=()=>({value:'chosen',options:[],add(option){this.options.push(option)}});
const filters=Array.from({length:5},filter);
const c={window:{},excludeDeletedTasks:ts=>ts.filter(t=>!t.deleted),normalizeDate:v=>v,filterDateFrom:{value:'2026-11-28'},filterDriver:filters[0],filterJob:filters[1],filterBA:filters[2],filterDMZ:filters[3],filterMRU:filters[4],TASK_MAP:{},TASKS_VERIFIED:false,checkAll:{},buildFilterLists:()=>filters.forEach(f=>{f.value='';f.options=[]}),applyFilters:()=>{},Option:function(text,value){this.value=value}};
vm.runInNewContext(helper,c);
const task={_key:'id',customerName:'Customer',assignedDate:'2026-11-28'};
c.publishLoadedTasks([task,{_key:'deleted',deleted:true},{_key:'done',status:'COMPLETED'}]);
const search=task._search;c.publishLoadedTasks([task]);assert.equal(task._search,search);assert.equal(c.window.__TASKS_DATA__.length,1);assert.ok(filters.every(f=>f.value==='chosen'));assert.equal(c.checkAll.disabled,true);
console.log('Passed filter retention, deleted/completed filtering and stable search index checks.');
