import {Engine,info,coordinate,seedFrom,combine} from './runtime/engine.js';
import {agentsFor} from './js/agents.js';
import {Board} from './js/board.js';
import {summarize,csv} from './js/statistics.js';

const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n).toLocaleString('ja-JP');
const percent=n=>Number.isFinite(n)?`${(n*100).toFixed(1)}%`:'—';
const ms=n=>Number.isFinite(n)?`${n.toFixed(2)} ms`:'—';
const localNames={AI01:{name:'Random',label:'一様ランダム',description:'100枚の鏡から、1枚を均等な確率で選びます。盤面の有利・不利は評価しない、比較の基準となるAIです。',tags:['RANDOM BASELINE','SEEDED RNG','NO SEARCH']},AI02:{name:'Rush Planner',label:'早期獲得を狙う経路計画AI',description:'今取れるコアを探し、相手の次の獲得を調べ、少ない回転で届く経路を優先します。2コアの確保を重視する戦略です。最速・最適な勝利を保証するAIではありません。',tags:['CAPTURE FIRST','OPPONENT REPLY','ROUTE PLANNING']}};
let engine,agents=[],match=null,board,view=0,playing=false,busy=false,liveClient=null,decisionToken=0,timer=null,toastTimer=null;
let experiment={records:[],metadata:null,status:'idle'},experimentBusy=false,experimentClient=null,lastExperimentRender=0;
let activeTab='arena';

class WorkerClient {
  constructor(){
    this.worker=new Worker(new URL('./js/worker.js',import.meta.url),{type:'module'});this.jobs=new Map();this.counter=0;
    this.worker.onmessage=event=>{const msg=event.data,job=this.jobs.get(msg.id);if(!job)return;
      if(msg.type==='result'){clearTimeout(job.timeout);this.jobs.delete(msg.id);job.resolve(msg.result);}
      else if(msg.type==='error'){clearTimeout(job.timeout);this.jobs.delete(msg.id);job.reject(new Error(msg.error));}
      else job.onProgress?.(msg);
    };
    this.worker.onerror=event=>{const error=new Error(event.message||'Worker failed');for(const job of this.jobs.values()){clearTimeout(job.timeout);job.reject(error);}this.jobs.clear();};
  }
  request(type,payload,onProgress){return new Promise((resolve,reject)=>{
    const id=++this.counter;const timeout=type==='think'?setTimeout(()=>{this.terminate();reject(new Error('AIが20秒以内に応答しませんでした。実装と計算量を確認してください。'));},20000):null;
    this.jobs.set(id,{resolve,reject,onProgress,timeout});this.worker.postMessage({id,type,payload});
  });}
  terminate(){this.worker.terminate();for(const job of this.jobs.values()){clearTimeout(job.timeout);job.reject(new Error('CANCELLED'));}this.jobs.clear();}
}
function notify(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3600);}
function report(error){if(error?.message==='CANCELLED')return;console.error(error);$('error-panel').textContent=error?.message??String(error);$('error-panel').hidden=false;}
function clearError(){$('error-panel').hidden=true;}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function agentLabel(id){return id==='HUMAN'?'あなた':id;}
function agentFull(id){const agent=agents.find(a=>a.id===id);return id==='HUMAN'?'あなた':agent?`${agent.id} / ${agent.name}`:id;}
function currentState(){return match?.states[match.states.length-1];}
function visibleState(){return match?.states[view];}
function canInteract(){return Boolean(match&&match.mode!=='replay'&&!experimentBusy&&!busy&&playing&&view===match.history.length&&!info(currentState()).finished&&match.players[info(currentState()).player]==='HUMAN');}
function stopTimer(){clearTimeout(timer);timer=null;}
function setTab(name){
  if(name!=='arena'){playing=false;stopTimer();}
  activeTab=name;
  document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==`panel-${name}`);
  document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===name;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(name==='arena'&&match)renderArena();
  if(name==='experiment')renderExperiment();
}
function initAgents(){
  for(const id of ['opponent-ai','first-ai','second-ai']){$(id).replaceChildren(...agents.map(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=`${a.id} · ${a.name}`;return o;}));}
  $('opponent-ai').value=agents.find(a=>a.id==='AI02')?.id??agents[0].id;
  $('first-ai').value=agents[0].id;$('second-ai').value=agents[1]?.id??agents[0].id;
  $('experiment-agents').innerHTML=agents.map(a=>`<label class="ai-checkbox"><input type="checkbox" value="${escape(a.id)}" checked><span>${escape(a.id)}</span><small>${escape(a.name)}</small></label>`).join('');
  $('agent-library').innerHTML=agents.map(a=>{const local=localNames[a.id];return `<article class="panel agent-card"><div class="agent-kicker"><span class="agent-id">${escape(a.id)}</span><span class="outline-tag">${escape(a.backend)} · v${escape(a.version)}</span></div><h2>${escape(a.name)}</h2><h3>${escape(local?.label??'カスタムAI')}</h3><p>${escape(local?.description??a.description)}</p><div class="agent-tags">${(local?.tags??['CUSTOM STRATEGY','SHARED ENGINE']).map(t=>`<span>${escape(t)}</span>`).join('')}</div></article>`;}).join('');
  $('library-count').textContent=`${agents.length} AGENTS INSTALLED`;
  updateEstimate();
}
function modeControls(){const human=$('match-mode').value==='human';$('human-settings').hidden=!human;$('watch-settings').hidden=human;}
function resetMatch(){
  if(experimentBusy||busy)return;
  clearError();stopTimer();decisionToken++;
  const seed=seedFrom($('board-seed').value||'0'),generated=engine.generate(seed),mode=$('match-mode').value;
  const players=mode==='watch'?[$('first-ai').value,$('second-ai').value]:Number($('human-side').value)===0?['HUMAN',$('opponent-ai').value]:[$('opponent-ai').value,'HUMAN'];
  match={mode,seed,players,budget:Number($('move-budget').value),initial:generated.state,certificate:generated.certificate,history:[],states:[generated.state],shots:[engine.trace(generated.state)],createdAt:new Date().toISOString()};
  view=0;playing=mode==='human';busy=false;renderArena();schedule();
}
function schedule(){
  stopTimer();if(!playing||busy||experimentBusy||!match||activeTab!=='arena')return;
  if(view<match.history.length){timer=setTimeout(()=>doStep(),Number($('speed').value));return;}
  if(info(currentState()).finished||match.mode==='replay'){playing=false;renderControls();return;}
  if(match.players[info(currentState()).player]!=='HUMAN')timer=setTimeout(()=>doStep(),Number($('speed').value));
}
async function doStep(){
  if(experimentBusy||busy||!match)return;
  if(view<match.history.length){view++;renderArena();schedule();return;}
  const state=currentState(),data=info(state);if(data.finished||match.mode==='replay'){playing=false;renderControls();return;}
  const ai=match.players[data.player];if(ai==='HUMAN')return;
  stopTimer();busy=true;renderControls();const token=++decisionToken;
  const seed=combine(match.seed,ai,data.player,data.turn);
  try{
    const result=await liveClient.request('think',{ai,state:state.slice(),seed,budget:match.budget});
    if(token!==decisionToken)return;
    busy=false;commit(result.move,{...result,ai,seed});
  }catch(error){busy=false;playing=false;report(error);liveClient?.terminate();liveClient=new WorkerClient();renderControls();}
}
function commit(move,diagnostics){
  const state=currentState(),before=info(state),result=engine.play(state,move);
  const row={turn:before.turn+1,player:before.player,ai:match.players[before.player],move,hits:result.hits,elapsed:0,simulations:0,graphVisits:0,planSteps:99,immediate:0,reply:0,budgetHit:false,...diagnostics};
  match.history.push(row);match.states.push(result.state);match.shots.push(result.shot);view=match.history.length;
  if(info(result.state).finished)playing=false;
  renderArena(true);$('announcer').textContent=`${agentLabel(row.ai)}が${coordinate(before.mirrors[move])}の鏡を回転。コア ${info(result.state).scores.join(' 対 ')}。`;
  schedule();
}
function humanMove(move){if(!canInteract()){if(match?.mode==='replay')notify('棋譜の再生中です。「新しい対局」で遊べます。');else if(!playing&&!busy)notify('再生ボタンで対局を再開してください。');return;}commit(move,{ai:'HUMAN'});}
function renderArena(animate=false){
  if(!match)return;
  const state=visibleState(),data=info(state),entry=view?match.history[view-1]:null;
  board.set(state,match.shots[view],{move:entry?.move??-1,animate});
  $('first-name').textContent=agentFull(match.players[0]);$('first-name').title=agentFull(match.players[0]);
  $('second-name').textContent=agentFull(match.players[1]);$('second-name').title=agentFull(match.players[1]);
  $('first-score').textContent=data.scores[0];$('second-score').textContent=data.scores[1];
  $('turn-count').textContent=`${String(data.turn).padStart(2,'0')} / 30`;
  $('player-first').classList.toggle('active',!data.finished&&data.player===0);$('player-second').classList.toggle('active',!data.finished&&data.player===1);
  $('core-pips').innerHTML=Array.from(data.owners,owner=>`<i class="${owner>=0?`owned-${owner}`:''}"></i>`).join('');
  $('timeline').max=match.history.length;$('timeline').value=view;$('timeline-label').textContent=`${view} / ${match.history.length}`;
  $('certificate-label').textContent=match.certificate?`初期コア到達 ${match.certificate.map(x=>x.length).join(' / ')} 回 · 検証済み`:'保存された初期盤面から再生';
  $('certificate-label').title='各コアを個別に破壊する手順の長さです。妨害下での最短勝利を保証しません。';
  $('result-banner').hidden=!data.finished;
  if(data.finished){const winner=data.scores[0]===data.scores[1]?null:data.scores[0]>data.scores[1]?0:1;$('result-banner').replaceChildren(document.createTextNode(winner===null?'DRAW · 引き分け':`${agentLabel(match.players[winner])} の勝利`));const small=document.createElement('small');small.textContent=`${data.scores[0]} — ${data.scores[1]} CORES / ${data.turn} TURNS`; $('result-banner').append(small);}
  renderDecision(entry);renderLog();renderControls();
}
function renderControls(){
  if(!match)return;const data=info(visibleState()),live=view===match.history.length;
  let status='';
  if(busy)status=`${agentLabel(match.players[info(currentState()).player])} が思考中`;
  else if(experimentBusy)status='実験中 · 対局は一時停止';
  else if(!live||match.mode==='replay')status=`棋譜再生 · ${view} 手目`;
  else if(data.finished)status='対局終了 · 下のスライダーで振り返れます';
  else if(!playing)status='一時停止中 · 再生ボタンでスタート';
  else status=match.players[data.player]==='HUMAN'?'あなたの番 · 鏡を選択':`${agentLabel(match.players[data.player])} の番`;
  $('status-pill').querySelector('span').textContent=status;$('status-pill').classList.toggle('busy',busy);$('status-pill').classList.toggle('paused',!playing&&!busy);
  $('play-icon').textContent=playing?'Ⅱ':'▶';$('play-label').textContent=playing?'一時停止':data.finished&&live?'棋譜を再生':'再生 / 再開';
  $('play-pause').disabled=experimentBusy;$('step-button').disabled=busy||experimentBusy||(live&&(data.finished||match.mode==='replay'||match.players[data.player]==='HUMAN'));
  $('new-match').disabled=busy||experimentBusy;$('shuffle-seed').disabled=busy||experimentBusy;$('import-match').disabled=busy||experimentBusy;
  $('board-hint').textContent=canInteract()?'鏡をクリックして90°回転':busy?'AIが経路を検討しています':match.mode==='replay'||!live?'スライダーで任意の手を確認できます':'共有の鏡 · レーザーは毎手、自動発射';
}
function renderDecision(entry){
  if(!entry){$('decision-tag').textContent='READY';$('decision-ai').textContent=match.mode==='watch'?'AI OBSERVATION':'YOUR MOVE';$('decision-title').textContent='光のルートを探そう。';$('decision-description').textContent='鏡を1枚回すと、その先の経路が変わります。3つのコアは両者共通です。';$('think-time').innerHTML='—<span> ms</span>';$('simulations').textContent='—';$('decision-detail').textContent='AIの選択と計算量が、ここに表示されます。';return;}
  const pos=info(match.initial).mirrors[entry.move],captured=(entry.hits&1)+((entry.hits>>1)&1)+((entry.hits>>2)&1);
  $('decision-tag').textContent=captured?'CAPTURE':'DECISION';$('decision-ai').textContent=entry.ai==='HUMAN'?'YOUR MOVE':`${entry.ai} / ${agents.find(a=>a.id===entry.ai)?.name??'CUSTOM'}`;
  $('decision-title').textContent=`${coordinate(pos)} の鏡を回転。`;
  $('decision-description').textContent=entry.ai==='AI01'?'100枚の鏡から均等ランダムで選択。獲得できるコアや相手の応手は評価していません。':entry.ai==='AI02'?'即時のコア獲得と相手の次手を調べ、残るコアへの経路を比較しました。最速勝利の保証はありません。':entry.ai==='HUMAN'?'あなたの一手が、新しい光の経路を作りました。':'登録されたカスタムAIの判断です。';
  $('think-time').innerHTML=entry.ai==='HUMAN'?'—<span> ms</span>':`${Number(entry.elapsed).toFixed(2)}<span> ms</span>`;
  $('simulations').textContent=number(entry.simulations??0);
  $('decision-detail').innerHTML=`<b>M${String(entry.move).padStart(3,'0')} · ${coordinate(pos)}</b> / この手で ${captured} コア獲得${entry.ai==='AI02'?`<br>確認した相手の即時獲得：${entry.reply??0}<br>候補経路の残り回転：${entry.planSteps<99?entry.planSteps:'—'}<br>経路グラフの処理状態：${number(entry.graphVisits??0)}${entry.budgetHit?'<br>※ 予算制限により相手の応手は一部のみ':''}`:''}`;
}
function renderLog(){
  $('log-count').textContent=`${String(match.history.length).padStart(2,'0')} MOVES`;
  if(!match.history.length){$('move-log').innerHTML='<div class="empty-log"><span>↗</span><p>最初の一手から、<br>ここに記録されます。</p></div>';return;}
  $('move-log').innerHTML=match.history.map((h,i)=>{const n=(h.hits&1)+((h.hits>>1)&1)+((h.hits>>2)&1);return `<button class="log-row ${h.player?'second':''}" data-view="${i+1}" title="この手の盤面を表示"><span class="log-turn">${String(i+1).padStart(2,'0')}</span><span class="log-name">${escape(agentLabel(h.ai))}</span><span class="log-position">${coordinate(info(match.initial).mirrors[h.move])}</span><span class="log-score ${n?'captured':''}">${n?`+${n}`:'—'}</span></button>`;}).reverse().join('');
}
function changeView(value){playing=false;stopTimer();view=Math.max(0,Math.min(match.history.length,Number(value)));renderArena();}
function exportMatch(){
  if(!match)return;
  const payload={format:'laser-ai-match-v1',engine:engine.manifest.engine,wasmSHA256:engine.hash,seed:match.seed,players:match.players,budget:match.budget,createdAt:match.createdAt,initial:Array.from(match.initial),certificate:match.certificate,history:match.history};
  download(JSON.stringify(payload,null,2),`laser-match-${match.seed}.json`,'application/json');notify('棋譜を保存しました。');
}
function openReplay(payload){
  if(payload.format!=='laser-ai-match-v1')throw new Error('対局用の棋譜JSONを選んでください。実験JSONからは、対局結果を画面上で選んで再生できます。');
  if(payload.engine!==engine.manifest.engine)throw new Error('この棋譜は異なるルールバージョンです。');
  if(payload.wasmSHA256&&engine.hash!=='unavailable'&&payload.wasmSHA256!==engine.hash)throw new Error('棋譜と現在のWasmが異なります。元のエンジンで再生してください。');
  if(!Array.isArray(payload.initial)||payload.initial.length!==341||!payload.initial.every(Number.isInteger)||!Array.isArray(payload.history)||payload.history.length>30||!Array.isArray(payload.players)||payload.players.length!==2||!payload.players.every(x=>typeof x==='string'&&x.length<100))throw new Error('棋譜の形式が不正です。');
  const initial=Int32Array.from(payload.initial);if(!engine.valid(initial)||info(initial).turn!==0||info(initial).scores.some(x=>x!==0)||engine.trace(initial).hits)throw new Error('棋譜の初期状態が不正です。');
  let state=initial;const states=[state],shots=[engine.trace(state)],history=[];
  for(const h of payload.history){if(!Number.isInteger(h.move)||h.move<0||h.move>=100||info(state).finished)throw new Error('棋譜に不正な操作があります。');
    const before=info(state),result=engine.play(state,h.move);state=result.state;states.push(state);shots.push(result.shot);
    history.push({...h,turn:before.turn+1,player:before.player,ai:payload.players[before.player],hits:result.hits,elapsed:Number.isFinite(h.elapsed)?Math.max(0,h.elapsed):0,simulations:Number.isFinite(h.simulations)?Math.max(0,h.simulations):0,graphVisits:Number.isFinite(h.graphVisits)?Math.max(0,h.graphVisits):0});
  }
  stopTimer();playing=false;decisionToken++;
  match={mode:'replay',seed:info(initial).seed,players:payload.players,budget:payload.budget??12000,initial,certificate:null,history,states,shots,createdAt:payload.createdAt??new Date().toISOString()};
  view=0;setTab('arena');renderArena();window.scrollTo({top:0,behavior:'smooth'});notify('棋譜を読み込みました。再生ボタンで観戦できます。');
}
function selectedAgents(){return [...$('experiment-agents').querySelectorAll('input:checked')].map(x=>x.value);}
function updateEstimate(){const count=selectedAgents().length,boards=Number($('experiment-boards').value),pairs=count*(count-1)/2;$('experiment-estimate').textContent=`${boards}盤面 × ${pairs}組 × 先後2局 = ${number(boards*pairs*2)}局`;$('start-experiment').disabled=experimentBusy||count<2;}
function lockExperimentControls(lock){for(const node of $('experiment-agents').querySelectorAll('input'))node.disabled=lock;for(const id of ['experiment-boards','experiment-seed','experiment-budget'])$(id).disabled=lock;$('start-experiment').hidden=lock;$('stop-experiment').hidden=!lock;}
async function startExperiment(){
  if(experimentBusy)return;const ids=selectedAgents();if(ids.length<2)return;
  clearError();playing=false;stopTimer();decisionToken++;
  if(busy){liveClient.terminate();liveClient=new WorkerClient();busy=false;}
  const boards=Number($('experiment-boards').value),seed=seedFrom($('experiment-seed').value),budget=Number($('experiment-budget').value);
  experiment={records:[],metadata:{format:'laser-ai-experiment-v1',ids,boards,seed,budget,totalGames:boards*ids.length*(ids.length-1),status:'running'},status:'running'};
  experimentBusy=true;lockExperimentControls(true);renderControls();renderExperiment();experimentClient=new WorkerClient();
  try{
    await experimentClient.request('tournament',{ids,boards,seed,budget},message=>{
      if(message.type==='meta')experiment.metadata=message.metadata;
      if(message.type==='progress'){experiment.records.push(...message.records);if(performance.now()-lastExperimentRender>160){renderExperiment();lastExperimentRender=performance.now();}}
    });
    experiment.status='complete';experiment.metadata.status='complete';experiment.metadata.completedAt=new Date().toISOString();notify('実験が完了しました。結果と条件を保存できます。');
  }catch(error){
    if(error.message!=='CANCELLED'){experiment.status='error';experiment.metadata.status='error';experiment.metadata.error=error.message;report(error);}else{experiment.status='stopped';experiment.metadata.status='stopped';}
  }finally{experimentBusy=false;experimentClient?.terminate();experimentClient=null;lockExperimentControls(false);updateEstimate();renderExperiment();renderControls();}
}
function renderExperiment(){
  const records=experiment.records,metadata=experiment.metadata,total=metadata?.totalGames??0;
  $('experiment-counter').textContent=`${number(records.length)} / ${number(total)}`;$('experiment-progress').max=Math.max(1,total);$('experiment-progress').value=records.length;
  const states={idle:['READY FOR AN EXPERIMENT','まだ、実験データはありません。'],running:['EXPERIMENT RUNNING','先後を入れ替えて、比較しています。'],complete:['EXPERIMENT COMPLETE','実験が完了しました。'],stopped:['PARTIAL RESULTS / EXPLORATORY','停止しました。完了ペアのみの参考結果です。'],error:['EXPERIMENT ERROR','実験を停止しました。エラーを確認してください。']};
  const text=states[experiment.status]??states.idle;$('experiment-status').textContent=text[0];$('experiment-progress-title').textContent=text[1];
  $('export-csv').disabled=!records.length;$('export-experiment').disabled=!records.length;
  if(!records.length){for(const id of ['stat-games','stat-cores','stat-draws','stat-first'])$(id).textContent='—';$('ranking-body').innerHTML='<tr><td colspan="7" class="empty-table">実験を開始すると、実測結果だけがここに表示されます。</td></tr>';$('pair-results').innerHTML='<p class="empty-copy">先後をまとめた盤面ペア単位で評価します。</p>';$('experiment-games').innerHTML='<p class="empty-copy">対局終了後、棋譜を選んで盤面を再生できます。</p>';return;}
  const result=summarize(records,metadata.ids);
  $('stat-games').textContent=number(result.games);$('stat-cores').textContent=(records.reduce((sum,g)=>sum+g.scores[0]+g.scores[1],0)/records.length).toFixed(2);
  $('stat-draws').textContent=percent(result.draws/result.games);$('stat-first').textContent=percent((result.firstWins+.5*result.draws)/result.games);
  let rank=0,previous=NaN;
  $('ranking-body').innerHTML=result.rows.map((r,i)=>{if(r.rate!==previous)rank=i+1;previous=r.rate;return `<tr><td><div class="ranking-ai"><span class="rank-number">${String(rank).padStart(2,'0')}</span><strong>${escape(r.id)}</strong></div></td><td>${percent(r.rate)}</td><td>${number(r.wins)} / ${number(r.draws)} / ${number(r.losses)}</td><td>${r.meanCores.toFixed(2)}</td><td>${ms(r.median)}</td><td>${ms(r.p95)}</td><td>${r.meanSimulations.toFixed(0)}</td></tr>`;}).join('');
  $('pair-results').innerHTML=result.pairs.map(p=>{const final=experiment.status==='complete',verdict=!final?'途中・部分結果：優位性の結論には使いません。':p.low>.5?`${p.ids[0]} の優位を支持（この実験条件）`:p.high<.5?`${p.ids[1]} の優位を支持（この実験条件）`:'区間が50%を含むため、優位とは判定しません。';return `<div class="pair-result"><div class="pair-top"><strong>${escape(p.ids[0])} → ${escape(p.ids[1])}</strong><span>${percent(p.mean)}</span></div><div class="interval-track" aria-label="得点率 ${percent(p.mean)}、信頼区間 ${percent(p.low)} から ${percent(p.high)}"><span class="interval-range" style="left:${p.low*100}%;width:${(p.high-p.low)*100}%"></span><span class="interval-point" style="left:${p.mean*100}%"></span></div><p class="pair-caption">95%同時区間 ${percent(p.low)} – ${percent(p.high)} · ${number(p.n)} 盤面ペア<br>左側AIの得点率 / 中央線 = 50%</p><p class="pair-verdict">${escape(verdict)}</p></div>`;}).join('');
  const last=records.slice(-12).reverse();$('experiment-games').innerHTML=last.map(g=>`<button class="experiment-game" data-game="${escape(g.id)}" ${experimentBusy?'disabled':''}><span>${escape(g.players.join(' vs '))}<small>SEED ${g.boardSeed} · ${g.turns} TURNS</small></span><b>${g.scores[0]} : ${g.scores[1]}</b><span>↗</span></button>`).join('');
}
function wire(){
  window.addEventListener('beforeunload',event=>{if(experimentBusy){event.preventDefault();event.returnValue='';}});
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
  for(const id of ['help-button','rules-link','footer-rules'])$(id).addEventListener('click',()=>$('rules-dialog').showModal());
  $('close-rules').addEventListener('click',()=>$('rules-dialog').close());$('rules-dialog').addEventListener('click',e=>{if(e.target===$('rules-dialog')){const r=$('rules-dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('rules-dialog').close();}});
  $('match-mode').addEventListener('change',modeControls);
  $('new-match').addEventListener('click',()=>{try{resetMatch();}catch(e){report(e);}});
  $('shuffle-seed').addEventListener('click',()=>{const array=new Uint32Array(1);crypto.getRandomValues(array);$('board-seed').value=array[0];try{resetMatch();}catch(e){report(e);}});
  $('play-pause').addEventListener('click',()=>{if(experimentBusy||!match)return;if(!playing&&info(currentState()).finished&&view===match.history.length)view=0;playing=!playing;renderArena();schedule();});
  $('step-button').addEventListener('click',()=>{playing=false;stopTimer();doStep();});
  $('speed').addEventListener('change',schedule);
  $('timeline').addEventListener('input',()=>changeView($('timeline').value));
  $('move-log').addEventListener('click',e=>{const row=e.target.closest('[data-view]');if(row)changeView(row.dataset.view);});
  $('beam-toggle').addEventListener('click',()=>{board.showBeams=!board.showBeams;$('beam-toggle').setAttribute('aria-pressed',String(board.showBeams));board.draw();});
  $('zoom-toggle').addEventListener('click',()=>{const zoom=$('board-scroll').classList.toggle('zoomed');$('zoom-toggle').setAttribute('aria-pressed',String(zoom));$('zoom-toggle').textContent=zoom?'−':'＋';board.draw();});
  $('export-match').addEventListener('click',exportMatch);$('import-match').addEventListener('click',()=>$('replay-file').click());
  $('replay-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10*1024*1024)throw new Error('棋譜ファイルが大きすぎます。上限は10MBです。');openReplay(JSON.parse(await file.text()));}catch(error){report(error);}finally{e.target.value='';}});
  $('go-experiment').addEventListener('click',()=>{setTab('experiment');window.scrollTo({top:0,behavior:'smooth'});});
  $('experiment-agents').addEventListener('change',updateEstimate);$('experiment-boards').addEventListener('change',updateEstimate);
  $('start-experiment').addEventListener('click',startExperiment);$('stop-experiment').addEventListener('click',()=>{experimentClient?.terminate();notify('停止しました。完了した先後ペアのみを残します。');});
  $('export-csv').addEventListener('click',()=>download(csv(experiment.records),`laser-experiment-${experiment.metadata.seed}.csv`,'text/csv;charset=utf-8'));
  $('export-experiment').addEventListener('click',()=>{const summary=summarize(experiment.records,experiment.metadata.ids);download(JSON.stringify({...experiment.metadata,status:experiment.status,records:experiment.records,summary},null,2),`laser-experiment-${experiment.metadata.seed}.json`,'application/json');});
  $('experiment-games').addEventListener('click',e=>{const button=e.target.closest('[data-game]');if(!button||experimentBusy)return;const game=experiment.records.find(g=>g.id===button.dataset.game);if(!game)return;try{const initial=engine.generate(game.boardSeed).state;openReplay({format:'laser-ai-match-v1',engine:engine.manifest.engine,wasmSHA256:engine.hash,initial:Array.from(initial),players:game.players,history:game.history,budget:experiment.metadata.budget,createdAt:experiment.metadata.createdAt});}catch(error){report(error);}});
}
async function boot(){
  try{
    if(location.protocol==='file:')throw new Error('このサイトはHTTPで開いてください。GitHub Pagesに公開するか、フォルダ内で「python -m http.server 8000」を実行し、http://localhost:8000 を開きます。');
    engine=await Engine.load();agents=agentsFor(engine);if(!agents.length)throw new Error('No AI registered');
    board=new Board($('board'),{onSelect:humanMove,canInteract,onHover:cell=>{
      $('position-readout').textContent=cell?`${cell.coordinate}${cell.mirror>=0?` · M${String(cell.mirror).padStart(3,'0')} · ${cell.kind===1?'/':'\\'}`:''}`:'A1 — O15';
      if(cell&&document.activeElement===$('board'))$('announcer').textContent=`${cell.coordinate} ${cell.mirror>=0?'鏡':'空きマスまたは設備'}`;
    }});
    initAgents();wire();modeControls();liveClient=new WorkerClient();
    $('runtime-badge').innerHTML='<i></i> C++ / WASM · READY';
    resetMatch();
  }catch(error){$('runtime-badge').textContent='ENGINE ERROR';report(error);}
}
boot();