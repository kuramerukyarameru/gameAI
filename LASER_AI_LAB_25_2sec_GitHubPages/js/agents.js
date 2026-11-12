import {info,random} from '../runtime/engine.js';
import {extensions} from './extensions.js';
import {byId} from './catalog.js';
export function agentsFor(engine){
  const list=engine.manifest.agents.map((a,index)=>({...byId[a.id],...a,index,runtime:'C++ / Wasm'}));
  const ids=new Set(list.map(a=>a.id));
  for(const a of extensions){if(!/^[A-Za-z][A-Za-z0-9_-]{1,31}$/.test(a.id)||ids.has(a.id)||typeof a.choose!=='function')throw new Error('Invalid/duplicate extension ID');ids.add(a.id);list.push({...a,runtime:'JavaScript'});}
  return list;
}
export async function chooseAgent(engine,id,state,seed,options){
  const a=agentsFor(engine).find(x=>x.id===id);if(!a)throw new Error(`Unknown agent: ${id}`);
  if(a.index!==undefined)return engine.choose(a.index,state,seed,options);
  const start=performance.now(),privateState=state.slice();let nodes=0,budgetHit=false;
  const hasBudget=()=>{const ok=nodes<options.nodes&&(!options.millis||performance.now()-start<options.millis);if(!ok)budgetHit=true;return ok;};
  const simulate=(s,m)=>{if(!hasBudget())throw new Error('Extension exceeded its budget');nodes++;return engine.play(s,m,{trace:false});};
  const value=await a.choose({state:privateState,engine,rng:random(seed),options,simulate,hasBudget});
  const result=typeof value==='number'?{move:value}:value;
  if(!result||!Number.isInteger(result.move)||result.move<0||result.move>=info(state).mirrorCount)throw new Error(`${id} returned an illegal move`);
  return {evaluations:0,rollouts:0,depth:0,considered:0,graphVisits:0,ttHits:0,proof:0,treeNodes:0,traceCalls:nodes,ratings:[],...result,nodes,elapsed:performance.now()-start,budgetHit};
}
