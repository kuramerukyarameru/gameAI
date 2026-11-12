export function quantile(sorted,p){if(!sorted.length)return NaN;const i=(sorted.length-1)*p,l=Math.floor(i);return sorted[l]+(sorted[Math.ceil(i)]-sorted[l])*(i-l);}
/** Non-asymptotic, distribution-free, simultaneous intervals.
 * One sample = average of BOTH seats on the same independently seeded board.
 * Treat each mirror density as a separate stratum. Do not count seats as iid.
 * These are FIXED-HORIZON bounds: do not interpret unfinished runs inferentially.
 */
export function summarize(records,ids,count,comparisons=1,allowIntervals=false){
 const games=records.filter(g=>count==='all'||g.mirrorCount===Number(count));
 const rows=Object.fromEntries(ids.map(id=>[id,{id,games:0,wins:0,draws:0,losses:0,cores:0,points:0,moves:0,times:[],nodes:0,evaluations:0,rollouts:0,graphVisits:0,ttHits:0,depth:0}]));
 const pairMap=new Map();let firstWins=0,secondWins=0,draws=0;
 for(const g of games){
  const winner=g.scores[0]===g.scores[1]?null:(g.scores[0]>g.scores[1]?0:1);if(winner===null)draws++;else if(winner===0)firstWins++;else secondWins++;
  for(let seat=0;seat<2;seat++){
   const row=rows[g.players[seat]];if(!row)continue;
   const value=winner===null?.5:winner===seat?1:0;row.games++;row.points+=value;row.cores+=g.scores[seat];
   if(value===1)row.wins++;else if(value===.5)row.draws++;else row.losses++;
   for(const h of g.history)if(h.player===seat){row.times.push(h.elapsed??0);row.moves++;for(const k of ['nodes','evaluations','rollouts','graphVisits','ttHits','depth'])row[k]+=h[k]??0;}
  }
  const pair=[...g.players].sort(),key=pair.join('|');if(!pairMap.has(key))pairMap.set(key,{ids:pair,boards:new Map()});
  const entry=pairMap.get(key),bkey=`${g.mirrorCount}:${g.boardSeed}`;if(!entry.boards.has(bkey))entry.boards.set(bkey,new Map());
  const seat=g.players.indexOf(pair[0]);entry.boards.get(bkey).set(seat,winner===null?.5:winner===seat?1:0);
 }
 const pairs=[];
 for(const p of pairMap.values()){
  const samples=[...p.boards.values()].filter(v=>v.size===2).map(v=>(v.get(0)+v.get(1))/2),n=samples.length,mean=n?samples.reduce((a,b)=>a+b,0)/n:NaN;
  const margin=n?Math.sqrt(Math.log(2*Math.max(1,comparisons)/.05)/(2*n)):1;
  pairs.push({ids:p.ids,n,mean,low:allowIntervals&&count!=='all'&&n?Math.max(0,mean-margin):null,high:allowIntervals&&count!=='all'&&n?Math.min(1,mean+margin):null});
 }
 for(const r of Object.values(rows)){r.rate=r.games?r.points/r.games:NaN;r.meanCores=r.games?r.cores/r.games:NaN;r.times.sort((a,b)=>a-b);r.median=quantile(r.times,.5);r.p95=quantile(r.times,.95);r.meanTime=r.times.length?r.times.reduce((a,b)=>a+b,0)/r.times.length:NaN;r.meanNodes=r.moves?r.nodes/r.moves:0;delete r.times;}
 return {rows:Object.values(rows).sort((a,b)=>(b.rate||0)-(a.rate||0)||a.id.localeCompare(b.id)),pairs,firstWins,secondWins,draws,games:games.length};
}
export function gameCSV(records){
 const fields=['id','mirror_count','board_seed','generator_kind','first_ai','second_ai','first_cores','second_cores','winner','turns','first_ms','second_ms','first_nodes','second_nodes','first_rollouts','second_rollouts'];
 const quote=v=>`"${String(v??'').replaceAll('"','""')}"`;
 const rows=records.map(g=>{const ms=[0,0],nodes=[0,0],roll=[0,0];for(const h of g.history){ms[h.player]+=h.elapsed??0;nodes[h.player]+=h.nodes??0;roll[h.player]+=h.rollouts??0;}
 return [g.id,g.mirrorCount,g.boardSeed,g.generatorKind,...g.players,...g.scores,g.scores[0]===g.scores[1]?'DRAW':g.players[g.scores[0]>g.scores[1]?0:1],g.turns,...ms,...nodes,...roll].map(quote).join(',');});
 return '\ufeff'+[fields.join(','),...rows].join('\r\n');
}
