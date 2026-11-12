import { customAgents } from './ai/custom.js';
import { random } from '../runtime/engine.js';
export function agentsFor(engine) {
  const compiled=engine.manifest.agents.map((agent,index)=>({...agent,backend:'C++ / Wasm',index}));
  const all=[...compiled,...customAgents.map(agent=>({...agent,backend:'JavaScript'}))];
  if(all.some(a=>!(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/).test(a.id)))throw new Error('AI IDs must be short ASCII identifiers beginning with a letter');
  if(new Set(all.map(a=>a.id)).size!==all.length)throw new Error('Duplicate AI identifier');
  return all;
}
export async function chooseAgent(engine,id,state,seed,budget) {
  const agent=agentsFor(engine).find(a=>a.id===id);
  if(!agent)throw new Error(`Unknown agent ${id}`);
  if(agent.backend==='C++ / Wasm')return engine.choose(agent.index,state,seed,budget);
  let simulations=0;
  const context={engine,seed,budget,random:random(seed),simulate(s,m){
    if(simulations>=budget)throw new Error(`${id}: simulation budget exceeded`);
    simulations++;return engine.play(s,m,{trace:false});
  }};
  const start=performance.now(), raw=await agent.choose(state.slice(),context);
  const result=typeof raw==='number'?{move:raw}:raw;
  if(!Number.isInteger(result?.move)||result.move<0||result.move>=100)throw new Error(`${id}: invalid move`);
  return {...result,elapsed:performance.now()-start,simulations,graphVisits:result.graphVisits??0,planSteps:result.planSteps??99,immediate:result.immediate??0,reply:result.reply??0,considered:result.considered??0,budgetHit:false,ratings:result.ratings??[]};
}
