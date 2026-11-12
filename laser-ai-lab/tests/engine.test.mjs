import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Engine,info,ABI} from '../runtime/engine.js';
const engine=await Engine.fromBytes(await fs.readFile(new URL('../runtime/AI.wasm',import.meta.url)));
assert.equal(engine.manifest.agents.length>=2,true);
let attempts=0,maxAttempts=0,games=0,totalThink=0;
const started=performance.now();
for(let seed=1;seed<=100;seed++){
  const {state,certificate,attempts:n}=engine.generate(seed);
  attempts+=n;maxAttempts=Math.max(maxAttempts,n);
  assert(engine.valid(state));
  assert.equal(engine.trace(state).hits,0,'No initial capture');
  assert.equal(info(state).board.filter(x=>x===1||x===2).length,100);
  assert.equal(info(state).board.filter(x=>x===3).length,3);
  assert.equal(info(state).board.filter(x=>x===4).length,3);
  assert.deepEqual(state,engine.generate(seed).state,'Deterministic generator');
  for(let c=0;c<3;c++){
    assert(certificate[c].length>=2&&certificate[c].length<=6);
    let s=state;
    for(const move of certificate[c]){if(!info(s).finished)s=engine.play(s,move).state;}
    assert(info(s).owners[c]>=0,'Every core has a verified legal witness');
  }
  if(seed<=12){
    let s=state;
    while(!info(s).finished){
      const idx=info(s).player===seed%2?0:1;
      const result=engine.choose(idx,s,seed*100+info(s).turn);
      assert(result.simulations<=12000);
      assert.deepEqual(result, {...result});
      const again=engine.choose(idx,s,seed*100+info(s).turn);
      assert.equal(result.move,again.move,'Deterministic AI with fixed seed/budget');
      totalThink+=result.elapsed;
      s=engine.play(s,result.move).state;
      assert(engine.valid(s));
    }
    assert(info(s).turn<=30);games++;
  }
}
// Verify all four physical reflection directions using a sparse diagnostic state.
for(let kind=1;kind<=2;kind++)for(let direction=0;direction<4;direction++){
  const s=new Int32Array(ABI.length);s[338]=s[339]=s[340]=-1;
  const mirror=7*15+7;
  const dx=[0,1,0,-1],dy=[-1,0,1,0];
  const source=(7-dy[direction])*15+7-dx[direction];
  const out=direction^(kind===1?1:3);
  const target=(7+dy[out])*15+7+dx[out];
  s[4+mirror]=kind;s[4+source]=3;s[4+target]=4;
  s[329]=source;s[332]=direction;s[335]=target;
  s[330]=0;s[333]=0;s[331]=224;s[334]=2;s[336]=1;s[337]=2;
  assert.equal(engine.trace(s).hits&1,1,`reflection ${kind}/${direction}`);
}
console.log(JSON.stringify({passed:true,seeds:100,witnesses:300,games,meanGenerationAttempts:attempts/100,maxAttempts,totalThinkMs:Math.round(totalThink),elapsedMs:Math.round(performance.now()-started)},null,2));
const {summarize}=await import('../js/statistics.js');
const mock=(i,p,s)=>({id:String(i),boardIndex:i,players:p,scores:s,history:[]});
const sample=summarize([
 mock(0,['A','B'],[2,1]),mock(0,['B','A'],[1,2]),
 mock(1,['A','B'],[1,1]),mock(1,['B','A'],[1,1]),
],['A','B']);
assert.equal(sample.pairs[0].n,2);
assert.equal(sample.pairs[0].mean,.75);
assert.equal(sample.rows.find(x=>x.id==='A').rate,.75);
console.log('Statistics tests passed.');
// Simultaneous firing: a removed core cannot reveal the next core in THIS shot.
{
 const s=new Int32Array(ABI.length);s[338]=s[339]=s[340]=-1;
 s[229]=0;s[4]=1;
 const sources=[7*15+1,1*15+7,224],directions=[1,2,1],cores=[7*15+3,7*15+5,3*15+7];
 for(let b=0;b<3;b++){s[329+b]=sources[b];s[332+b]=directions[b];s[4+sources[b]]=3;s[335+b]=cores[b];s[4+cores[b]]=4;}
 const first=engine.play(s,0);
 assert.equal(first.hits,5);assert.deepEqual(info(first.state).scores,[2,0]);
 const second=engine.play(first.state,0);
 assert.equal(second.hits,2);assert.deepEqual(info(second.state).scores,[2,1]);
 assert.equal(info(second.state).finished,true);
}
// Two beams striking the same common core award exactly one point.
{
 const s=new Int32Array(ABI.length);s[338]=s[339]=s[340]=-1;
 s[229]=0;s[4]=1;
 const sources=[7*15+1,1*15+7,224],directions=[1,2,1],cores=[7*15+7,2*15+2,12*15+12];
 for(let b=0;b<3;b++){s[329+b]=sources[b];s[332+b]=directions[b];s[4+sources[b]]=3;s[335+b]=cores[b];s[4+cores[b]]=4;}
 const outcome=engine.play(s,0);
 assert.equal(outcome.hits,1);assert.equal(info(outcome.state).scores[0],1);
}
console.log('Simultaneous-shot and duplicate-hit tests passed.');
