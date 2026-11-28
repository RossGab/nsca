import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=readFileSync('assign.html','utf8');
const c={};vm.createContext(c);vm.runInContext(html.slice(html.indexOf('async function forEachTaskDate('),html.indexOf('function applyLoadOverrides(')),c);
let active=0,peak=0;const visited=[];
await c.forEachTaskDate(['a','b','c','d','e'],async day=>{
 active++;peak=Math.max(peak,active);
 await new Promise(resolve=>setTimeout(resolve,10));visited.push(day);active--;
});
assert.equal(peak,3);assert.deepEqual(visited.sort(),['a','b','c','d','e']);assert.equal(active,0);
let finished=false;
await assert.rejects(c.forEachTaskDate(['bad','slow','queued'],async day=>{
 if(day==='bad')throw Error('network');
 await new Promise(resolve=>setTimeout(resolve,10));finished=true;
},2),/network/);
assert.equal(finished,true);
assert.equal(html.includes('onclick="loadMoreTasks()"'),false);
console.log('Passed bounded concurrency, full automatic traversal, and draining active queries before reporting failure.');
const diagnosticsSource=html.slice(html.indexOf('let ASSIGN_LOAD_STATS ='),html.indexOf('// Limit concurrent date queries;'));
const output={};const d={document:{getElementById:()=>output}};vm.createContext(d);vm.runInContext(diagnosticsSource,d);
vm.runInContext('ASSIGN_LOAD_STATS = {startedAt:Date.now(), records:0, requests:0, pending:0, queryMs:0, renderMs:0, phase:"Starting"}',d);
let reads=0;await d.measureAssignQuery(async()=>{reads++;return {docs:[{},{}]}});
assert.equal(reads,1);assert.match(output.textContent,/2 records received/);assert.match(output.textContent,/1 task queries/);assert.match(output.textContent,/0 queries waiting/);
await assert.rejects(d.measureAssignQuery(async()=>{throw Error('network')}),/network/);assert.match(output.textContent,/0 queries waiting/);
console.log('Passed local timing counters and error cleanup without additional queries.');
