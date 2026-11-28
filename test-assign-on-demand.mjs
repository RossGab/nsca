import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=readFileSync('assign.html','utf8');
const source=html.slice(html.indexOf('async function fetchNextTaskBatch()'),html.indexOf('function applyLoadOverrides('));
const controls=new Map();const el=id=>{if(!controls.has(id))controls.set(id,{style:{},disabled:false});return controls.get(id)};
let calls=0, reject=false, release;
const saves=[];
const c={window:{__TASKS_DATA__:[]},TASK_PAGE_STATE:{from:'2026-11-27',to:'2026-11-28',dateKeys:['20261127','20261128'],dateIndex:0,cursor:null,tasks:[]},TASK_LOAD_IN_PROGRESS:false,TASK_ACTION_BUSY:false,
 loadBtn:el('load'),filterDateFrom:el('from'),filterDateTo:el('to'),loadingBar:el('bar'),loadingText:el('text'),ASSIGN_PAGE_CACHE_SCOPE:'partial',console:{error:()=>{}},updateLoadMoreControls:()=>{},
 applyLoadOverrides:ts=>ts.filter(t=>t._key!=='deleted'),publishLoadedTasks:ts=>c.window.__TASKS_DATA__=ts,
 writeTaskCache:async(from,to,tasks,options)=>saves.push({tasks,options}),
 loadLiveTasksFromFirebase:async(date,cursor)=>{calls++;if(reject)throw Error('network');if(release)await new Promise(r=>release=r);return {tasks:[{_key:String(calls)}],cursor:String(calls),hasMore:calls===1}}};
vm.createContext(c);vm.runInContext(source,c);
await c.fetchNextTaskBatch();assert.equal(calls,1);assert.equal(c.TASK_PAGE_STATE.dateIndex,0);assert.equal(c.TASK_PAGE_STATE.cursor,'1');assert.equal(saves.length,1);assert.equal(saves[0].options.full,undefined);assert.equal(saves[0].options.pagination.cursor,'1');
await c.window.loadMoreTasks();assert.equal(calls,2);assert.equal(c.TASK_PAGE_STATE.dateIndex,1);assert.equal(c.TASK_PAGE_STATE.cursor,null);assert.equal(c.window.__TASKS_DATA__.length,2);
reject=true;await c.window.loadMoreTasks();assert.equal(c.TASK_PAGE_STATE.dateIndex,1);assert.equal(c.TASK_LOAD_IN_PROGRESS,false);assert.match(c.loadingText.innerText,/Try Load more/);
reject=false;await c.window.loadMoreTasks();assert.equal(c.TASK_PAGE_STATE.dateIndex,2);assert.ok(saves.some(s=>s.options.full===true));
const before=calls;await c.window.loadMoreTasks();assert.equal(calls,before);
c.TASK_PAGE_STATE.dateIndex=0;release=true;
const pending=c.window.loadMoreTasks();await Promise.resolve();await c.window.loadMoreTasks();assert.equal(calls,before+1);release();await pending;
console.log('Passed one batch per click, multi-date cursors, partial/full cache separation, retry and duplicate-click checks.');
