import {Engine,info,random,combine} from '../runtime/engine.js';
import {agentsFor,chooseAgent} from './agents.js';
const ready=Engine.load();const yieldTurn=()=>new Promise(r=>setTimeout(r,0));
self.onmessage=async ({data})=>{
 const {id,type,payload}=data;
 try{
  const engine=await ready;
  if(type==='think'){const result=await chooseAgent(engine,payload.ai,payload.state,payload.seed,payload.options);self.postMessage({id,type:'result',result});return;}
  if(type!=='tournament')throw new Error('Unknown worker request');
  const {ids,boards,seed,counts,options}=payload,available=agentsFor(engine);
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length<2||ids.length>50||ids.some(x=>!available.some(a=>a.id===x)))throw new Error('Invalid agent list');
  if(!Number.isInteger(boards)||boards<1||boards>2000||!Array.isArray(counts)||!counts.length||counts.length>20||new Set(counts).size!==counts.length||counts.some(x=>!Number.isInteger(x)||x<6||x>200))throw new Error('Invalid board settings');
  const pairs=[];for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)pairs.push([ids[i],ids[j]]);
  const totalGames=pairs.length*2*boards*counts.length;if(totalGames>20000)throw new Error('Browser experiment limit: 20,000 games');
  const metadata={format:'laser-experiment-v2',engine:engine.manifest.engine,generator:engine.manifest.generator,wasmSHA256:engine.hash,createdAt:new Date().toISOString(),userAgent:self.navigator.userAgent,seed,options,counts,boards,ids,agents:available.filter(a=>ids.includes(a.id)).map(({choose,...a})=>a),totalGames,plannedComparisons:pairs.length*counts.length,status:'running',method:'Paired seats on each board; stratified by mirror count; fixed-horizon Hoeffding-Bonferroni simultaneous 95% bounds',warmup:'One 1,000-transition warm-up per selected AI; not recorded',failurePolicy:'Abort experiment on illegal move, runtime error, or uncertifiable board; no silent substitution'};
  self.postMessage({id,type:'meta',metadata});
  const warm=engine.generate(314159,100).state;
  for(const ai of ids){await chooseAgent(engine,ai,warm,combine(seed,ai,'warm'),{...options,nodes:1000,millis:0});await yieldTurn();}
  let completed=0,seen=new Set(),rng=random(seed),boardsGenerated=0;
  for(let boardIndex=0;boardIndex<boards;boardIndex++){
   let boardSeed;do{boardSeed=rng();}while(seen.has(boardSeed)||boardSeed>=1000000&&boardSeed<=1000599);seen.add(boardSeed);
   for(const mirrorCount of counts){
    const generated=engine.generate(boardSeed,mirrorCount),initial=generated.state;boardsGenerated++;
    // Rotate pair order between boards; both seats always remain paired.
    const offset=boardIndex%pairs.length;
    for(let p=0;p<pairs.length;p++){
     const pairIndex=(p+offset)%pairs.length,pair=pairs[pairIndex],records=[];
     const legOrder=(boardIndex+pairIndex+mirrorCount)%2?[1,0]:[0,1];
     for(const leg of legOrder){
      const players=leg===0?pair:[...pair].reverse();let state=initial.slice();const history=[];
      while(!info(state).finished){
       const {player,turn}=info(state),ai=players[player],aiSeed=combine(seed,boardSeed,mirrorCount,pair.join('|'),ai,player,turn);
       const d=await chooseAgent(engine,ai,state,aiSeed,options),out=engine.play(state,d.move,{trace:false});
       const {ratings,...metrics}=d;
       history.push({turn:turn+1,player,ai,seed:aiSeed,hits:out.hits,...metrics});state=out.state;
      }
      records.push({id:`${mirrorCount}-${boardIndex}-${pairIndex}-${leg}`,boardIndex,boardSeed,mirrorCount,generatorKind:info(initial).generatorKind,attempts:generated.attempts,players:[...players],scores:info(state).scores,turns:info(state).turn,initial:Array.from(initial),history});
     }
     completed+=2;self.postMessage({id,type:'progress',records,completed,total:totalGames,boardsGenerated});await yieldTurn();
    }
   }
  }
  self.postMessage({id,type:'result',result:{status:'complete',completed,boardsGenerated}});
 }catch(error){self.postMessage({id,type:'error',error:error?.message??String(error)});}
};
