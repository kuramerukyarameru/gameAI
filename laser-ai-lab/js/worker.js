import {Engine,info,random,combine} from '../runtime/engine.js';
import {agentsFor,chooseAgent} from './agents.js';
const ready=Engine.load();
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
self.onmessage=async event=>{
  const {id,type,payload}=event.data;
  try{
    const engine=await ready;
    if(type==='think'){
      const result=await chooseAgent(engine,payload.ai,payload.state,payload.seed,payload.budget);
      self.postMessage({id,type:'result',result});return;
    }
    if(type!=='tournament')throw new Error('Unknown worker request');
    const {ids,boards,seed,budget}=payload;
    if(!Array.isArray(ids)||ids.length<2||ids.length>20||!Number.isInteger(boards)||boards<1||boards>2000)throw new Error('Invalid experiment settings');
    const available=agentsFor(engine);
    if(ids.some(x=>!available.some(a=>a.id===x)))throw new Error('Unknown agent in experiment');
    const pairs=[];for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)pairs.push([ids[i],ids[j]]);
    if(boards*pairs.length*2>100000)throw new Error('This experiment exceeds the 100,000-game browser limit.');
    const metadata={format:'laser-ai-experiment-v1',engine:engine.manifest.engine,generator:engine.manifest.generator,wasmSHA256:engine.hash,createdAt:new Date().toISOString(),userAgent:self.navigator.userAgent,seed,budget,boards,ids,agents:available.filter(a=>ids.includes(a.id)).map(({choose,...a})=>a),method:'Paired board / reversed seats / fixed simulation cap / Hoeffding-Bonferroni simultaneous 95% CI',totalGames:boards*pairs.length*2,status:'running'};
    self.postMessage({id,type:'meta',metadata});
    // Warm up each selected implementation without recording these decisions.
    const warm=engine.generate(314159).state;
    for(const ai of ids)for(let i=0;i<3;i++)await chooseAgent(engine,ai,warm,combine(seed,ai,'warm',i),budget);
    const rng=random(seed),seen=new Set();
    let completed=0;
    for(let boardIndex=0;boardIndex<boards;boardIndex++){
      let boardSeed;do{boardSeed=rng();}while(seen.has(boardSeed));seen.add(boardSeed);
      const {state:initial}=engine.generate(boardSeed);
      for(let pairIndex=0;pairIndex<pairs.length;pairIndex++){
        const pair=pairs[pairIndex],records=[];
        // Alternate execution order, not just player seats, to reduce warmup drift.
        const legOrder=(boardIndex+pairIndex)%2?[1,0]:[0,1];
        for(const leg of legOrder){
          const players=leg===0?pair:[...pair].reverse();let state=initial.slice();const history=[];
          while(!info(state).finished){
            const {player,turn}=info(state),ai=players[player],aiSeed=combine(seed,boardSeed,pair.join('|'),ai,player,turn);
            const d=await chooseAgent(engine,ai,state,aiSeed,budget);
            const outcome=engine.play(state,d.move,{trace:false});
            history.push({turn:turn+1,player,ai,move:d.move,seed:aiSeed,hits:outcome.hits,elapsed:d.elapsed,simulations:d.simulations,graphVisits:d.graphVisits,planSteps:d.planSteps,immediate:d.immediate,reply:d.reply,budgetHit:d.budgetHit});
            state=outcome.state;
          }
          records.push({id:`${boardIndex}-${pairIndex}-${leg}`,boardIndex,boardSeed,players:[...players],scores:info(state).scores,turns:info(state).turn,history});
        }
        completed+=2;
        self.postMessage({id,type:'progress',records,completed,total:metadata.totalGames});
        await pause();
      }
    }
    self.postMessage({id,type:'result',result:{status:'complete',completed}});
  }catch(error){self.postMessage({id,type:'error',error:error?.message??String(error)});}
};
