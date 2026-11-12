import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Engine,info} from '../runtime/engine.js';
const engine=await Engine.fromBytes(await fs.readFile(new URL('../runtime/AI.wasm',import.meta.url)));
const count=Number(process.argv[2]??1000);
assert(Number.isInteger(count)&&count>0&&count<=100000);
let totalAttempts=0,maxAttempts=0;
const started=performance.now();
for(let seed=1;seed<=count;seed++){
 const g=engine.generate(seed);assert(engine.valid(g.state));assert.equal(engine.trace(g.state).hits,0);
 totalAttempts+=g.attempts;maxAttempts=Math.max(maxAttempts,g.attempts);
 for(let c=0;c<3;c++){
  let state=g.state;
  for(const m of g.certificate[c]){if(!info(state).finished)state=engine.play(state,m,{trace:false}).state;}
  assert(info(state).owners[c]>=0);
 }
}
console.log(JSON.stringify({passed:true,seeds:count,verifiedWitnesses:count*3,meanAttempts:totalAttempts/count,maxAttempts,elapsedMs:Math.round(performance.now()-started)},null,2));
