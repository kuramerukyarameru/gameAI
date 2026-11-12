import fs from 'node:fs';
import {Engine,info,combine} from '../runtime/engine.js';
const engine=await Engine.fromBytes(fs.readFileSync(new URL('../runtime/AI.wasm',import.meta.url)));
const options={nodes:2000000,millis:2,depth:3,width:6};
const perAI=new Map(engine.manifest.agents.map(a=>[a.id,[]]));
let decisions=0,finished=0,overshoots=0;
for (const mirrors of [6,50,100,200]) {
  for (const seed of [113,2026,7311]) {
    const initial=engine.generate(seed,mirrors).state;
    for (let i=0;i<25;i++) {
      let s=initial.slice();
      for(let moveNumber=0;moveNumber<3&&!info(s).finished;moveNumber++){
        const aiIndex=moveNumber===1?0:i;
        const decision=engine.choose(aiIndex,s,combine(i,seed,mirrors,moveNumber),options);
        if(decision.move<0||decision.move>=info(s).mirrorCount)throw new Error(`Illegal move ${i} on ${mirrors}`);
        if(!Number.isFinite(decision.elapsed)||decision.elapsed<0)throw new Error(`Bad timing ${i}`);
        perAI.get(engine.manifest.agents[aiIndex].id).push(decision.elapsed);
        decisions++;
        if(decision.elapsed>2)overshoots++;
        s=engine.play(s,decision.move,{trace:false}).state;
        if(!engine.valid(s))throw new Error(`Invalid state by AI ${i}`);
      }
    }
  }
}
for(const mirrors of [6,100,200]){
 const seed=combine('full-match',mirrors);
 const initial=engine.generate(seed,mirrors).state;
 for(let i=0;i<25;i++)for(let side=0;side<2;side++){
  let s=initial.slice();
  while(!info(s).finished){
   const player=info(s).player;
   const aiIndex=player===side?i:0;
   const decision=engine.choose(aiIndex,s,combine(i,side,info(s).turn,mirrors),options);
   if(decision.move<0||decision.move>=mirrors)throw Error(`Illegal move in match ${i} ${mirrors}`);
   s=engine.play(s,decision.move,{trace:false}).state;
  }
  finished++;
 }
}
const agentTimes=[...perAI].map(([id,measurements])=>{
 measurements.sort((a,b)=>a-b);
 const avg=measurements.reduce((a,b)=>a+b,0)/measurements.length;
 const pct=q=>measurements[Math.min(measurements.length-1,Math.floor(measurements.length*q))];
 return {id,count:measurements.length,averageMs:Number(avg.toFixed(3)),p95Ms:Number(pct(.95).toFixed(3)),maxMs:Number(measurements.at(-1).toFixed(3))};
});
const report={package:'Edition 03',algorithmCount:engine.manifest.agents.length,mirrorCounts:[6,50,100,200],targetMsPerMove:2,budgetType:'cooperative deadline; NOT strict hard real-time preemption',decisions,measuredAbove2ms:overshoots,fullGames:finished,agentTimes,invalidMoves:0};
fs.writeFileSync(new URL('./2ms-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({algorithms:report.algorithmCount,decisions,fullGames:finished,measuredAbove2ms:overshoots,maxMs:Math.max(...agentTimes.map(x=>x.maxMs)),errors:report.invalidMoves},null,2));
