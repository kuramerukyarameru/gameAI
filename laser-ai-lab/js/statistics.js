/** Paired-board, distribution-free confidence intervals.
 * Each independent sampled board contributes one bounded [0,1] pair average.
 * Both seat assignments stay together. Bonferroni controls simultaneous
 * coverage across all pairwise comparisons in the predeclared tournament.
 * Assumes the generator seeds represent independent samples; fixed-horizon.
 */
export function summarize(records,agents,alpha=.05) {
  const ids=agents.map(a=>typeof a==='string'?a:a.id);
  const comparisons=Math.max(1,ids.length*(ids.length-1)/2);
  const rows=Object.fromEntries(ids.map(id=>[id,{id,games:0,wins:0,draws:0,losses:0,cores:0,points:0,moves:0,times:[],simulations:0,graphVisits:0}]));
  const pairMap=new Map();let firstWins=0,secondWins=0,draws=0;
  for(const game of records){
    const winner=game.scores[0]===game.scores[1]?null:(game.scores[0]>game.scores[1]?0:1);
    if(winner===null)draws++;else if(winner===0)firstWins++;else secondWins++;
    for(let seat=0;seat<2;seat++){
      const row=rows[game.players[seat]];if(!row)continue;
      const value=winner===null?.5:winner===seat?1:0;
      row.games++;row.points+=value;row.cores+=game.scores[seat];
      if(value===1)row.wins++;else if(value===.5)row.draws++;else row.losses++;
      for(const h of game.history)if(h.player===seat){row.times.push(h.elapsed);row.moves++;row.simulations+=h.simulations;row.graphVisits+=h.graphVisits??0;}
    }
    const pair=[...game.players].sort(),key=pair.join('|');
    if(!pairMap.has(key))pairMap.set(key,{ids:pair,boards:new Map()});
    const entry=pairMap.get(key),boardKey=game.boardIndex;
    if(!entry.boards.has(boardKey))entry.boards.set(boardKey,[]);
    const seat=game.players.indexOf(pair[0]);
    entry.boards.get(boardKey).push(winner===null?.5:winner===seat?1:0);
  }
  const pairs=[];
  for(const {ids:pair,boards} of pairMap.values()){
    const samples=[...boards.values()].filter(x=>x.length===2).map(x=>(x[0]+x[1])/2);
    const n=samples.length,mean=n?samples.reduce((a,b)=>a+b,0)/n:NaN;
    const margin=n?Math.sqrt(Math.log(2*comparisons/alpha)/(2*n)):1;
    pairs.push({ids:pair,n,mean,low:n?Math.max(0,mean-margin):0,high:n?Math.min(1,mean+margin):1,margin});
  }
  for(const row of Object.values(rows)){
    row.rate=row.games?row.points/row.games:NaN;
    row.meanCores=row.games?row.cores/row.games:NaN;
    row.times.sort((a,b)=>a-b);
    row.median=quantile(row.times,.5);row.p95=quantile(row.times,.95);
    row.meanSimulations=row.moves?row.simulations/row.moves:0;
  }
  return {rows:Object.values(rows).sort((a,b)=>(b.rate||0)-(a.rate||0)),pairs,firstWins,secondWins,draws,games:records.length,comparisons,alpha};
}
export function quantile(values,p) {
  if(!values.length)return NaN;
  const index=(values.length-1)*p,lo=Math.floor(index),hi=Math.ceil(index);
  return values[lo]+(values[hi]-values[lo])*(index-lo);
}
export function csv(records) {
  const quote=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const header=['game_id','board_index','board_seed','first_ai','second_ai','first_cores','second_cores','winner','turns','first_total_ms','second_total_ms','first_simulations','second_simulations'];
  const lines=records.map(g=>{
    const ms=[0,0],nodes=[0,0];for(const m of g.history){ms[m.player]+=m.elapsed;nodes[m.player]+=m.simulations;}
    return [g.id,g.boardIndex,g.boardSeed,...g.players,...g.scores,g.scores[0]===g.scores[1]?'DRAW':g.players[g.scores[0]>g.scores[1]?0:1],g.turns,...ms.map(x=>x.toFixed(4)),...nodes].map(quote).join(',');
  });
  return '\ufeff'+[header.join(','),...lines].join('\r\n');
}
