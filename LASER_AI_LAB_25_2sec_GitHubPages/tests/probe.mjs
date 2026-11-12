import fs from 'node:fs';import {Engine,info,combine} from '../runtime/engine.js';
const e=await Engine.fromBytes(fs.readFileSync(new URL('../runtime/AI.wasm',import.meta.url)));
let boards=0,witnesses=0,fallback=0;
for(const count of [6,7,12,20,30,50,75,100,125,150,180,195,200])for(let seed=1;seed<=30;seed++){
 let g;try{g=e.generate(seed,count)}catch(error){console.log({count,seed});throw error;}if(!e.valid(g.state)||e.trace(g.state).hits)throw Error('Invalid initial board');
 if(info(g.state).mirrorCount!==count)throw Error('Wrong count');
 fallback+=info(g.state).generatorKind;boards++;
 for(let k=0;k<3;k++){let s=g.state;for(const m of g.certificate[k])s=e.play(s,m,{trace:false}).state;if(info(s).owners[k]<0)throw Error('Invalid witness');witnesses++;}
}
console.log({boards,witnesses,fallback});
const s=e.generate(20261112,100).state;
for(let i=0;i<25;i++){
 const d=e.choose(i,s,123,{nodes:12000,millis:0,depth:3,width:6});
 if(!Number.isInteger(d.move)||d.move<0||d.move>=100)throw Error('Illegal AI move');
 console.log(e.manifest.agents[i].id,d.move,d.elapsed.toFixed(1),d.nodes,d.depth,d.rollouts,d.proof);
}
