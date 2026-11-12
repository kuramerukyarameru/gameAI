import fs from 'node:fs';import assert from 'node:assert/strict';
import {Engine,info,combine,random} from '../runtime/engine.js';
import {summarize} from '../js/statistics.js';
import {agentsFor,chooseAgent} from '../js/agents.js';import {extensions} from '../js/extensions.js';
const e=await Engine.fromBytes(fs.readFileSync(new URL('../runtime/AI.wasm',import.meta.url)));
const report={engine:e.manifest.engine,wasmSHA256:e.hash,generatedBoards:0,witnesses:0,fallbackBoards:0,fullGames:0,aiDecisions:0,determinismChecks:0,alphaNegamaxChecks:0,proofChecks:0,statisticalChecks:0,extensionChecks:0,timeModeChecks:0,learnedPerspectiveChecks:0,errors:[]};
assert.equal(e.manifest.agents.length,25);
// Every supported density, plus extra density-stratified seed samples.
const settings=[];for(let count=6;count<=200;count++)settings.push([count,104729+count]);
for(const count of [6,7,12,20,30,50,75,100,125,150,180,195,200])for(let seed=1;seed<=50;seed++)settings.push([count,seed]);
for(const [count,seed] of settings){
 const g=e.generate(seed,count),s=g.state,v=info(s);assert(e.valid(s));assert.equal(v.mirrorCount,count);assert.equal(e.trace(s).hits,0);assert.equal(new Set(v.mirrors).size,count);
 report.generatedBoards++;report.fallbackBoards+=v.generatorKind;
 for(let k=0;k<3;k++){let t=s.slice();for(const m of g.certificate[k]){assert(!info(t).finished);t=e.play(t,m,{trace:false}).state;}assert(info(t).owners[k]>=0);report.witnesses++;}
 const twice=e.generate(seed,count);assert.deepEqual(s,twice.state);assert.deepEqual(g.certificate,twice.certificate);
}
const immutable=e.generate(20261112,100).state;
for(let ai=0;ai<25;ai++){
 const original=immutable.slice();const options={nodes:12000,millis:0,depth:3,width:6};
 const a=e.choose(ai,immutable,12345,options),b=e.choose(ai,immutable,12345,options);
 assert.deepEqual(immutable,original);assert.equal(a.move,b.move,`AI${ai+1} determinism`);assert.equal(a.nodes,b.nodes);assert(a.nodes<=options.nodes);report.determinismChecks++;
 const timed=e.choose(ai,immutable,4321,{nodes:2000000,millis:10,depth:5,width:6});assert(timed.move>=0&&timed.move<100);assert(timed.nodes<=2000000);report.timeModeChecks++;
}
// Completed adversarial values must agree; tie-breaking has the same root order.
for(const count of [6,10,15])for(let seed=1;seed<=8;seed++){
 const initial=e.generate(87000+seed,count).state;let s=initial;
 for(let turn=0;turn<4&&!info(s).finished;turn++)s=e.play(s,combine(seed,turn)%count,{trace:false}).state;
 if(info(s).finished)continue;
 const a=e.choose(4,s,999,{nodes:2000000,millis:0,depth:3,width:6});const b=e.choose(13,s,999,{nodes:2000000,millis:0,depth:3,width:6});
 assert.equal(a.depth,3);assert.equal(b.depth,3);assert.equal(a.move,b.move,`alpha vs negamax count=${count} seed=${seed}`);assert(a.nodes<=b.nodes);report.alphaNegamaxChecks++;
}
// Strict-win proofs at the final turn: unknown is never promoted to proven.
for(const won of [false,true]){
 const s=e.generate(2,6).state;s[0]=29;
 if(won){s[2]=2;s[440]=1;s[441]=1;}
 assert(e.valid(s));const d=e.choose(20,s,42,{nodes:1000,millis:0,depth:3,width:6});
 assert.equal(d.proof,won?1:-1);report.proofChecks++;
}
// All 25 agents play both seats at three densities, against the random baseline.
for(const count of [6,100,200])for(let ai=0;ai<25;ai++)for(let leg=0;leg<2;leg++){
 let s=e.generate(combine('smoke',count,ai),count).state;const line=[];
 while(!info(s).finished){const v=info(s),actor=v.player===leg?ai:0;const d=e.choose(actor,s,combine('decision',count,ai,leg,v.turn),{nodes:1000,millis:0,depth:3,width:6});
  assert(Number.isInteger(d.move)&&d.move>=0&&d.move<count);assert(d.nodes<=1000);s=e.play(s,d.move,{trace:false}).state;assert(e.valid(s));line.push(d.move);report.aiDecisions++;
 }
 assert(s[0]<=30);assert(s[1]+s[2]<=3);report.fullGames++;
}
// Paired-seat estimator, density separation, duplicates and fixed-horizon gating.
const fake=(seed,count,players,scores)=>({boardSeed:seed,mirrorCount:count,players,scores,history:[]});
const records=[fake(1,20,['A','B'],[2,1]),fake(1,20,['B','A'],[2,1]),fake(2,20,['A','B'],[2,1]),fake(2,20,['B','A'],[0,3]),fake(1,100,['A','B'],[0,0]),fake(1,100,['B','A'],[0,0])];
let st=summarize(records,['A','B'],20,2,true);assert.equal(st.games,4);assert.equal(st.pairs[0].n,2);assert.equal(st.pairs[0].mean,.75);assert.equal(st.rows.find(x=>x.id==='A').rate,.75);report.statisticalChecks++;
st=summarize(records,['A','B'],100,2,true);assert.equal(st.games,2);assert.equal(st.pairs[0].mean,.5);report.statisticalChecks++;
st=summarize(records,['A','B'],20,2,false);assert.equal(st.pairs[0].low,null);report.statisticalChecks++;
st=summarize(records,['A','B'],'all',2,true);assert.equal(st.pairs[0].low,null);report.statisticalChecks++;
// The learned model is trained in the player-to-move viewpoint.
const model=JSON.parse(fs.readFileSync(new URL('../models/model.json',import.meta.url)));
for(const count of [6,100,200])for(let seed=1;seed<=3;seed++){
 const state=e.generate(44000+seed,count).state,root=info(state).player,values=[];
 for(let m=0;m<count;m++){
  const t=e.play(state,m,{trace:false}).state,v=info(t),diff=v.scores[root]-v.scores[1-root];
  if(v.finished)values.push((diff>0?10000:diff<0?-10000:0)+diff*100);
  else{
   const f=e.features(t,v.player),prediction=f.reduce((sum,x,j)=>sum+x*model.weights[j],0);
   values.push((v.player===root?1:-1)*Math.max(-.99,Math.min(.99,prediction))*1000);
  }
 }
 const result=e.choose(24,state,77,{nodes:1000,millis:0,depth:3,width:6});
 assert(Math.abs(values[result.move]-Math.max(...values))<1e-8);
 report.learnedPerspectiveChecks++;
}
// No UI changes required for a JavaScript AI: registry and runner see it.
extensions.push({id:'AI26',name:'Test Extension',choose:({rng,state})=>rng()%state[4]});assert.equal(agentsFor(e).length,26);
const custom=await chooseAgent(e,'AI26',immutable,99,{nodes:1000,millis:0,depth:2,width:3});assert(custom.move>=0&&custom.move<100);extensions.pop();report.extensionChecks++;
assert.throws(()=>e.generate(1,5));assert.throws(()=>e.generate(1,201));assert.throws(()=>e.play(immutable,-1));assert.throws(()=>e.play(immutable,100));
fs.writeFileSync(new URL('./engine-report.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
