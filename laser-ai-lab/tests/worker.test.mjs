import {Worker} from 'node:worker_threads';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Engine} from '../runtime/engine.js';
const worker=new Worker(new URL('./node-worker-entry.mjs',import.meta.url));
let id=0;
function call(type,payload){return new Promise((resolve,reject)=>{
 const current=++id,records=[];let metadata;
 const timeout=setTimeout(()=>reject(new Error('Worker test timeout')),60000);
 const listener=msg=>{if(msg.id!==current)return;
  if(msg.type==='meta')metadata=msg.metadata;
  if(msg.type==='progress'){
   assert.equal(msg.records.length,2);assert.equal(msg.records[0].boardSeed,msg.records[1].boardSeed);
   assert.deepEqual(msg.records[0].players,[...msg.records[1].players].reverse());records.push(...msg.records);
  }
  if(msg.type==='result'||msg.type==='error'){clearTimeout(timeout);worker.off('message',listener);if(msg.type==='error')reject(new Error(msg.error));else resolve({records,metadata,result:msg.result});}
 };
 worker.on('message',listener);worker.postMessage({id:current,type,payload});
});}
try{
 const engine=await Engine.fromBytes(await fs.readFile(new URL('../runtime/AI.wasm',import.meta.url)));
 const state=engine.generate(20261112).state;
 const thought=await call('think',{ai:'AI02',state,seed:123,budget:12000});
 assert(thought.result.move>=0&&thought.result.move<100);
 const payload={ids:['AI01','AI02'],boards:5,seed:424242,budget:12000};
 const a=await call('tournament',payload),b=await call('tournament',payload);
 assert.equal(a.records.length,10);assert.equal(b.records.length,10);
 const stable=records=>records.map(g=>({seed:g.boardSeed,players:g.players,scores:g.scores,moves:g.history.map(h=>h.move)}));
 assert.deepEqual(stable(a.records),stable(b.records),'Fixed-budget tournament is reproducible');
 for(const game of a.records)for(const h of game.history)assert(h.simulations<=12000);
 console.log(JSON.stringify({passed:true,games:20,pairedBoards:10,reproducible:true,worker:'production ES module via Node adapter'},null,2));
}finally{await worker.terminate();}
