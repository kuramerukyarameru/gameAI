// Deterministic training data. Training seeds never come from a tournament.
import fs from 'node:fs';
import {Engine,info,combine,random} from '../runtime/engine.js';
const engine=await Engine.fromBytes(fs.readFileSync(new URL('../runtime/AI.wasm',import.meta.url)));
const counts=[20,50,100,150,200],games=600,startSeed=1000000;
const rows=['game,split,mirror_count,board_seed,turn,target,f0,f1,f2,f3,f4,f5,f6,f7,f8,f9'];let positions=0;
for(let game=0;game<games;game++){
  const count=counts[game%counts.length],seed=startSeed+game;let s=engine.generate(seed,count).state;const samples=[];
  while(!info(s).finished){
    const root=info(s).player; samples.push({turn:s[0],root,features:engine.features(s,root)});
    // An explicitly specified mixed behavior policy: 70% random, 30% greedy.
    const r=random(combine(seed,s[0],'behavior'));
    const ai=r()%10<7?0:6;
    const d=engine.choose(ai,s,r(),{nodes:1000,millis:0,depth:1,width:6});s=engine.play(s,d.move,{trace:false}).state;
  }
  for(const x of samples){
    const d=s[1+x.root]-s[2-x.root],target=d>0?1:d<0?-1:0;
    rows.push([game,Math.floor(game/5)%5===0?'validation':'train',count,seed,x.turn,target,...x.features].join(','));positions++;
  }
}
fs.writeFileSync(new URL('../models/training.csv',import.meta.url),rows.join('\n')+'\n');
fs.writeFileSync(new URL('../models/dataset.json',import.meta.url),JSON.stringify({games,positions,startSeed,endSeed:startSeed+games-1,mirrorCounts:counts,behavior:'70% Random + 30% Greedy, per decision',split:'floor(game / 5) % 5 === 0: validation; otherwise training; stratified across all five mirror counts',target:'terminal win/draw/loss = 1/0/-1, viewpoint of player to move',generator:engine.manifest.generator},null,2));
console.log({games,positions});
