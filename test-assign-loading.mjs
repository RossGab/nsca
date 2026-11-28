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
