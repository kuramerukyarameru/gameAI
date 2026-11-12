import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Engine,info,combine} from '../runtime/engine.js';
const e=await Engine.fromBytes(fs.readFileSync(new URL('../runtime/AI.wasm', import.meta.url)));
assert.equal(e.manifest.agents.length,25);
const counts=[6,100,200],timings=[],checks=[];
for (const count of counts) {
 const state=e.generate(combine('budget-test',count),count).state;
 for (const budget of [2,20]) {
  for (let i=0;i<25;i++) {
   const d=e.choose(i,state,combine(count,budget,i),{nodes:2000000,millis:budget,depth:3,width:6});
   assert(d.move>=0 && d.move<count,`invalid move for AI ${i+1}`);
   assert(d.nodes<=2000000,`node cap exceeded for AI ${i+1}`);
   checks.push({agent:`AI${String(i+1).padStart(2,'0')}`,count,budget,elapsed:Number(d.elapsed.toFixed(2))});
  }
 }
}
// All 25 built-in implementations accept the full 2-second budget.
// They can finish immediately instead of using the full allowance.
for(let i=0;i<25;i++) {
 const state=e.generate(combine('long-budget',i),100).state;
 const d=e.choose(i,state,combine('long',i),{nodes:2000000,millis:2000,depth:3,width:6});
 assert(d.move>=0 && d.move<100,`invalid move for AI ${i+1} at 2sec`);
 assert(d.nodes<=2000000);
 if(d.elapsed>3200)throw new Error(`AI${i+1} exceeded soft budget by too much (${d.elapsed.toFixed(0)}ms)`);
 timings.push({agent:`AI${String(i+1).padStart(2,'0')}`,elapsedMs:Number(d.elapsed.toFixed(2)),nodes:d.nodes,budgetHit:d.budgetHit});
 console.log(`${timings.at(-1).agent}: ${d.elapsed.toFixed(1)}ms`);
}
// Lightweight full matches at 20ms give broad transition/termination coverage.
let fullGames=0;
for(const count of counts){for(const i of [0,3,4,6,14,24]){
 let s=e.generate(combine('match',count,i),count).state;
 while(!info(s).finished){const v=info(s),a=v.player?0:i;
  const d=e.choose(a,s,combine(count,i,v.turn),{nodes:2000000,millis:20,depth:3,width:6});
  s=e.play(s,d.move,{trace:false}).state;assert(e.valid(s));}
 fullGames++;}}
const report={engine:e.manifest.engine,wasmSHA256:e.hash,agentCount:25,defaultBudgetMs:2000,maxSelectableBudgetMs:2000,selectableBudgetsMs:[2,20,200,2000],mirrorCounts:counts,shortBudgetDecisions:checks.length,fullBudgetDecisions:timings.length,fullGames,fullBudgetAgentTimes:timings,allLegal:true,softBudget:true};
fs.writeFileSync(new URL('./2sec-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({agentCount:25,shortBudgetDecisions:checks.length,fullBudgetDecisions:timings.length,fullGames,maxObservedMs:Math.max(...timings.map(x=>x.elapsedMs))},null,2));
