import {Engine,info,coordinate,seedFrom,combine} from './runtime/engine.js';
import {agentsFor} from './js/agents.js';
import {byId} from './js/catalog.js';
import {Board} from './js/board.js';
import {summarize,gameCSV} from './js/statistics.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmt=n=>Number.isFinite(n)?n.toLocaleString('ja-JP'):'—';
const readableDuration=ms=>{const s=Math.ceil(ms/1000);if(s<60)return `${s}秒`;if(s<3600)return `${Math.floor(s/60)}分${s%60}秒`;return `${Math.floor(s/3600)}時間${Math.floor(s%3600/60)}分`;};
const pct=n=>Number.isFinite(n)?`${(n*100).toFixed(1)}%`:'—';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let engine,agents=[],game=null,autoplay=false,thinking=false,epoch=0,timer=null,arenaWorker=null,experimentWorker=null,experiment=null,currentFamily='all',toastTimer=null;
const board=new Board($('#game-board'),playHuman);
const describe=id=>agents.find(a=>a.id===id)||{id,name:id==='HUMAN'?'人間':id,summary:'読み込んだ棋譜の参加者。'};
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3700);}
function showError(error){console.error(error);$('#error-banner').textContent=`処理を続けられませんでした。\n${error?.message||error}\n公開時は runtime/ と js/ を含む全ファイルをアップロードしてください。HTMLのダブルクリックではなく、GitHub PagesまたはローカルHTTPサーバーから開いてください。`;$('#error-banner').hidden=false;}
function hideError(){$('#error-banner').hidden=true;}
function showView(name){for(const v of $$('.view')){const on=v.id===`view-${name}`;v.hidden=!on;v.classList.toggle('active',on);}for(const b of $$('.rail .nav-item')){const on=b.dataset.view===name;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}if(name==='arena')requestAnimationFrame(()=>board.resize());if(name==='lab')updatePlan();}
class Client {
 constructor(){
  this.jobs=new Map();this.id=0;this.worker=new Worker(new URL('./js/worker.js',import.meta.url),{type:'module'});
  this.worker.onmessage=({data})=>{const job=this.jobs.get(data.id);if(!job)return;if(data.type==='result'){this.jobs.delete(data.id);job.resolve(data.result);}else if(data.type==='error'){this.jobs.delete(data.id);job.reject(new Error(data.error));}else job.onEvent?.(data);};
  this.worker.onerror=e=>{for(const j of this.jobs.values())j.reject(new Error(e.message||'Worker error'));this.jobs.clear();};
 }
 call(type,payload,onEvent){return new Promise((resolve,reject)=>{const id=++this.id;this.jobs.set(id,{resolve,reject,onEvent});this.worker.postMessage({id,type,payload});});}
 terminate(){this.worker.terminate();for(const j of this.jobs.values())j.reject(new Error('Cancelled'));this.jobs.clear();}
}
function options(){
 const depth=Number($('#max-depth').value),width=Number($('#beam-width').value);
 if(!Number.isInteger(depth)||depth<1||depth>10||!Number.isInteger(width)||width<1||width>200)throw new Error('最大深さは1〜10、候補幅は1〜200にしてください。');
 const millis=Number($('#think-budget').value);
 if(![2,20,200,2000].includes(millis))throw new Error('思考時間は2/20/200/2000msから選択してください。');
 // Same cooperative deadline for every AI, with a secondary safety node cap.
 // Changing this setting requires a new game for the ARENA to use it.
 return {nodes:2000000,millis,depth,width};
}
function cancelArena(){
 autoplay=false;epoch++;clearTimeout(timer);
 if(thinking&&arenaWorker){arenaWorker.terminate();arenaWorker=null;}thinking=false;
}
function newGame(){
 if(!engine)return;
 if(experiment?.status==='running'){toast('比較実験を停止してから盤面を変更してください。');return;}
 try{
  const count=Number($('#mirror-count').value);if(!Number.isInteger(count)||count<6||count>200)throw new Error('鏡の枚数は6〜200の整数にしてください。');
  const config=options();cancelArena();hideError();
  const generated=engine.generate(seedFrom($('#board-seed').value),count);
  game={initial:generated.state,states:[generated.state],shots:[engine.trace(generated.state)],history:[],cursor:0,players:[$('#player-first').value,$('#player-second').value],certificate:generated.certificate,attempts:generated.attempts,options:config,readonly:false};
  $('#board-loading').hidden=true;renderGame();updatePlan();
 }catch(e){showError(e);}
}
function updateMirrors(value){let n=Number(value);if(!Number.isFinite(n))return;$('#mirror-count').value=value;$('#mirror-range').value=Math.min(200,Math.max(6,n));for(const b of $$('[data-mirrors]'))b.classList.toggle('selected',Number(b.dataset.mirrors)===n);}
function schedule(){clearTimeout(timer);if(autoplay&&!thinking&&game){const v=info(game.states[game.cursor]);if(game.cursor<game.history.length||!v.finished&&game.players[v.player]!=='HUMAN')timer=setTimeout(advance,Number($('#play-speed').value));}}
async function advance(){
 if(!game||thinking||experiment?.status==='running')return;
 if(game.cursor<game.history.length){game.cursor++;renderGame(true);schedule();return;}
 const state=game.states.at(-1),v=info(state);
 if(v.finished||game.readonly){autoplay=false;renderGame();return;}
 if(game.players[v.player]==='HUMAN'){renderGame();return;}
 const token=epoch,ai=game.players[v.player],seed=combine(v.seed,v.mirrorCount,ai,v.turn,'arena');
 try{
  if(!arenaWorker)arenaWorker=new Client();thinking=true;renderGame();
  const d=await arenaWorker.call('think',{ai,state,seed,options:game.options});
  if(token!==epoch)return;thinking=false;
  commitMove(d.move,{...d,ai,seed});schedule();
 }catch(e){if(token!==epoch||e.message==='Cancelled')return;thinking=false;autoplay=false;showError(e);renderGame();}
}
function commitMove(move,diagnostics){
 const state=game.states.at(-1),v=info(state),out=engine.play(state,move);
 game.history.push({turn:v.turn+1,player:v.player,hits:out.hits,...diagnostics,move});
 game.states.push(out.state);game.shots.push(out.shot);game.cursor=game.history.length;
 if(info(out.state).finished)autoplay=false;renderGame(true);
}
function playHuman(move){
 if(!game||thinking||experiment?.status==='running')return;
 const v=info(game.states.at(-1));
 if(game.cursor!==game.history.length){toast('最新の手まで戻ってから操作してください。');return;}
 if(v.finished||game.readonly||game.players[v.player]!=='HUMAN'){toast('人間の手番だけ鏡を操作できます。先手・後手を変更して盤面を生成してください。');return;}
 commitMove(move,{ai:'HUMAN',elapsed:0,nodes:0,rollouts:0,evaluations:0,depth:0,ratings:[]});autoplay=!info(game.states.at(-1)).finished;schedule();
}
function seek(turn){cancelArena();if(!game)return;game.cursor=Math.max(0,Math.min(game.history.length,turn));renderGame();}
function renderGame(animate=false){
 if(!game)return;const state=game.states[game.cursor],v=info(state),last=game.cursor?game.history[game.cursor-1]:null;
 board.set(state,game.shots[game.cursor],last?.move??-1,last?.ratings||[],animate);
 const [a,b]=game.players.map(describe);
 for(const [prefix,agent,score] of [['first',a,v.scores[0]],['second',b,v.scores[1]]]){
  $(`#${prefix}-id`).textContent=agent.id==='HUMAN'?'YOU':agent.id;$(`#${prefix}-name`).textContent=agent.name;$(`#${prefix}-score`).textContent=score;
 }
 $('#core-indicator').innerHTML=Array.from(v.owners,owner=>`<i class="${owner===0?'p1':owner===1?'p2':''}"></i>`).join('');
 $('#turn-number').textContent=String(v.turn).padStart(2,'0');$('#board-density').textContent=`${v.mirrorCount} / 225 CELLS`;
 $('#replay-position').max=game.history.length;$('#replay-position').value=game.cursor;$('#replay-label').textContent=`${game.cursor} / ${game.history.length}`;
 $('#previous-turn').disabled=game.cursor===0;$('#next-turn').disabled=game.cursor>=game.history.length;
 $('#play-pause').disabled=thinking||experiment?.status==='running'||game.readonly&&game.cursor===game.history.length;
 $('#step-forward').disabled=thinking||experiment?.status==='running'||(v.finished||game.readonly)&&game.cursor===game.history.length;
 $('#play-pause').textContent=autoplay?'Ⅱ 一時停止':v.finished&&!game.readonly?'↻ もう一度':game.readonly?'▶ 再生':'▶ 対戦を開始';
 const live=game.cursor===game.history.length,status=thinking?'THINKING':!live?'REPLAY':v.finished?'MATCH COMPLETE':game.players[v.player]==='HUMAN'?'YOUR TURN':autoplay?'MATCH RUNNING':'READY TO PLAY';
 $('#arena-state').textContent=status;$('.live-label').classList.toggle('running',autoplay||thinking);
 const nextName=describe(game.players[v.player]).name;
 let instruction=thinking?`${describe(game.players[v.player]).id} が思考中。計算は別のWorkerで行います。`:!live?'記録済みの局面を表示しています。▶で続きの記録を再生できます。':v.finished?(v.scores[0]===v.scores[1]?`引き分け。${v.scores[0]} − ${v.scores[1]}`:`${v.scores[0]>v.scores[1]?a.id:b.id} の勝利。${v.scores[0]} − ${v.scores[1]}`):game.players[v.player]==='HUMAN'?'あなたの手番です。鏡をクリックすると90°回転し、レーザーが発射されます。':`${nextName} の手番です。開始または1手送りで、選んだ鏡を観測できます。`;
 $('#arena-instruction').textContent=instruction;
 const cert=game.certificate;$('#certificate-summary').textContent=cert?`3個すべてを検証済み · ${cert.map(x=>x.length).join(' / ')}操作`:'読み込んだ棋譜。操作の合法性を再検証済み。';
 $('#show-certificate').disabled=!cert;
 $('#decision-title').textContent=last?`${last.ai} の判断`:'思考を観測する';
 $('#decision-subtitle').textContent=last?`${coordinate(v.mirrors[last.move])} の鏡を90°回転 · ${last.hits?countBits(last.hits)+'コア獲得':'獲得なし'}`:'各操作の計算量をここに表示します。';
 $('#metric-time').textContent=last?(last.elapsed??0).toFixed(1):'—';$('#metric-nodes').textContent=last?compact(last.nodes??0):'—';
 $('#metric-depth').textContent=last?last.depth??0:'—';$('#metric-rollouts').textContent=last?compact(last.rollouts??0):'—';
 let note=last?last.ai==='HUMAN'?'人間の操作です。':`${last.considered??0}候補を確認。${last.budgetHit?'計算予算で探索を打ち切りました。':'方式が使う計算を完了しました。'}`:'数値は実測値です。AIごとに評価の尺度や予算の使い方は異なります。';
 if(last?.ai==='AI21')note+=last.proof===1?' この局面で勝利を証明しました。':last.proof===-1?' 厳密な勝利を反証しました（引き分けを含む）。':' 勝敗の証明は未確定です。';
 if(last?.ttHits)note+=` 置換表再利用 ${fmt(last.ttHits)}回。`;
 $('#decision-note').textContent=note;
 $('#current-agent-details').dataset.agent=last?.ai==='HUMAN'?game.players.find(x=>x!=='HUMAN')||'AI01':last?.ai||game.players[v.player];
 $('#log-count').textContent=`${String(game.cursor).padStart(2,'0')} MOVES`;
 $('#move-log').innerHTML=game.cursor?game.history.slice(0,game.cursor).slice(-8).reverse().map(h=>`<li><span class="log-turn">${String(h.turn).padStart(2,'0')}</span><div><button class="text-button log-agent" data-seek="${h.turn}">${esc(h.ai)} <span>↗ ${coordinate(v.mirrors[h.move])}</span></button><span class="log-detail">${(h.elapsed||0).toFixed(1)} ms · ${fmt(h.nodes||0)} nodes</span></div>${h.hits?`<span class="log-gain">+${countBits(h.hits)}</span>`:'<span class="tiny-label">ROTATE</span>'}</li>`).join(''):'<li class="empty-log">まだ操作はありません。<br><span>Every decision leaves a trace.</span></li>';
}
function countBits(n){return (n&1)+((n>>1)&1)+((n>>2)&1);}
function compact(n){return n>=1000000?`${(n/1000000).toFixed(1)}m`:n>=10000?`${(n/1000).toFixed(1)}k`:fmt(n);}
function showAgent(id){
 if(id==='HUMAN')return;const a=describe(id);if(!a.id)return;
 const steps=a.steps||['追加AIのchoose関数で鏡の番号を返します。詳細は実装者の説明を確認してください。'];
 $('#agent-dialog-body').innerHTML=`<div class="dialog-top"><span class="agent-id">${esc(a.id)}</span><span class="small-pill">${esc(a.runtime||'C++ / Wasm')}</span><span class="tiny-label">VERSION ${esc(a.version||'2.0.0')}</span></div><h2>${esc(a.name)}</h2><span class="small-pill">${esc(a.label||'CUSTOM AGENT')}</span><p class="dialog-summary">${esc(a.summary||'追加AI')}</p><h3>どのように動く？</h3><ol>${steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>${a.formula?`<h3>評価・選択の考え方</h3><div class="formula">${esc(a.formula)}</div>`:''}<h3>この方式の狙い</h3><p>${esc(a.strength||'実装者が追加した方策です。')}</p><h3>実験の比較ポイント</h3><p>${esc(a.compare||'共通の予算で既存AIと比較してください。')}</p><h3>パラメータと計算予算</h3><p>${esc(a.parameters||'拡張AIの定義を参照してください。')}</p><div class="limitation-box"><h3>保証しないこと・注意点</h3><p>${esc(a.caution||'外部の追加コードは同梱25体の検証対象とは別です。')}</p></div><div class="dialog-footer"><code>${a.function?`cpp/algorithms.hpp → ${esc(a.function)}()`:'js/extensions.js'}</code><button class="button primary" data-use-agent="${esc(a.id)}">後手に設定する ↗</button></div>`;
 $('#agent-dialog').showModal();
}
function showCertificate(){
 if(!game?.certificate)return;const v=info(game.initial);
 $('#certificate-body').innerHTML=`<p class="eyebrow">REACHABILITY CERTIFICATE</p><h2>各コアに届く、実際の手順。</h2><p class="dialog-summary">それぞれ初期盤面から独立に試す操作列です。相手の妨害下での獲得や、最短手順の証明ではありません。AI本体にはこの解答列を渡していません。</p><div class="certificate-list">${game.certificate.map((moves,k)=>`<div><strong>CORE ${k+1} / ${coordinate(v.cores[k])}</strong><p>${moves.map(m=>coordinate(v.mirrors[m])).join(' → ')}</p><p>${moves.length}操作で到達を確認</p></div>`).join('')}</div><h3>生成方法</h3><p>${v.generatorKind===0?'ランダム配置から、検証に通る盤面を選びました。':'到達する経路を組み立てた配置です。少数・多数の鏡でも手順を保証するための代替生成を使用しました。'} 試行回数 ${game.attempts}。</p>`;
 $('#certificate-dialog').showModal();
}
function renderAtlas(){
 const q=$('#agent-search').value.trim().toLowerCase();
 const list=agents.filter(a=>(currentFamily==='all'||a.family===currentFamily)&&`${a.id} ${a.name} ${a.label} ${a.summary}`.toLowerCase().includes(q));
 $('#agent-atlas').innerHTML=list.length?list.map(a=>`<article class="agent-card"><div class="agent-card-top"><span class="agent-id">${esc(a.id)}</span><span class="agent-orbit"></span></div><h3>${esc(a.name)}</h3><p class="agent-label">${esc(a.label||'拡張AI')}</p><p class="agent-description">${esc(a.summary)}</p><button class="text-button" data-agent="${esc(a.id)}">仕組みと制限を読む ↗</button></article>`).join(''):'<p class="empty-cell">条件に一致するAIがありません。</p>';
}
function selectedAgents(){return $$('#experiment-agents input:checked').map(x=>x.value);}
function experimentConfig(){
 const counts=[...new Set($('#experiment-counts').value.split(',').map(x=>Number(x.trim())))].sort((a,b)=>a-b),boards=Number($('#experiment-boards').value),ids=selectedAgents(),config=options();
 if(!counts.length||counts.length>20||counts.some(x=>!Number.isInteger(x)||x<6||x>200)||!Number.isInteger(boards)||boards<1||boards>2000||ids.length<2)throw new Error('AIを2体以上選び、鏡の枚数6〜200・盤面数1〜2000を指定してください。');
 const totalGames=ids.length*(ids.length-1)*boards*counts.length;if(totalGames>20000)throw new Error('ブラウザでの1実験は20,000対局までです。盤面数やAI数を減らしてください。');
 return {ids,counts,boards,seed:seedFrom($('#experiment-seed').value),options:config,totalGames};
}
function updatePlan(){
 try{
  const cfg=experimentConfig();$('#planned-games').textContent=fmt(cfg.totalGames);$('#plan-formula').textContent=`${cfg.ids.length}体 × ${cfg.boards}盤面 × ${cfg.counts.length}条件 · 先後2局`;
  $('#plan-time-estimate').textContent=`最長の思考時間をすべての手番で使った場合: 約${readableDuration(cfg.totalGames*30*cfg.options.millis)}＋盤面生成・描画時間（早期終局・即決で短縮）`;
  $('#experiment-budget').textContent=cfg.options.millis?`${fmt(cfg.options.millis)} ms / decision · cooperative cutoff`:`${fmt(cfg.options.nodes)} transitions / decision`;
  if(engine&&experiment?.status!=='running')$('#run-experiment').disabled=false;
 }catch(e){$('#planned-games').textContent='—';$('#plan-formula').textContent=e.message;$('#plan-time-estimate').textContent='';if(experiment?.status!=='running')$('#run-experiment').disabled=true;}
}
function lockExperiment(locked){
 for(const el of $$('.experiment-setup input,.experiment-setup button'))el.disabled=locked;
 $('#stop-experiment').disabled=!locked;$('#run-experiment').disabled=locked;$('#new-game').disabled=locked;
 if(!locked)updatePlan();renderGame();
}
async function runExperiment(){
 if(!engine||experiment?.status==='running')return;
 try{
  const cfg=experimentConfig();cancelArena();hideError();
  experiment={metadata:{...cfg,format:'laser-experiment-v2',plannedComparisons:cfg.ids.length*(cfg.ids.length-1)/2*cfg.counts.length},records:[],status:'running',completed:0,total:cfg.totalGames};
  $('#result-count').innerHTML=cfg.counts.map(c=>`<option value="${c}">${c}枚</option>`).join('')+'<option value="all">全枚数（参考）</option>';
  $('#experiment-status').textContent='初期化・ウォームアップ中';$('#progress-fill').style.width='0%';$('#progress-label').textContent=`0 / ${fmt(cfg.totalGames)}`;
  lockExperiment(true);renderResults();experimentWorker=new Client();
  const current=experiment;
  const result=await experimentWorker.call('tournament',cfg,message=>{
   if(experiment!==current)return;
   if(message.type==='meta')current.metadata=message.metadata;
   if(message.type==='heartbeat'){
    $('#experiment-status').textContent=`対戦中 · ${message.first} vs ${message.second} · 鏡${message.mirrorCount}枚 · 第${message.turn}/30手`;
   }
   if(message.type==='progress'){
    current.records.push(...message.records);current.completed=message.completed;
    $('#experiment-status').textContent='実行中 · 完了した先後ペアを保存';
    $('#progress-label').textContent=`${fmt(current.completed)} / ${fmt(current.total)}`;
    $('#progress-fill').style.width=`${100*current.completed/current.total}%`;renderResults();
   }
  });
  if(experiment!==current)return;current.status='complete';current.metadata.status='complete';current.metadata.completedAt=new Date().toISOString();
  $('#experiment-status').textContent='実験完了 · 固定試行数の結果';renderResults();lockExperiment(false);toast(`${fmt(result.completed)}対局が完了しました。`);
 }catch(e){
  if(e.message==='Cancelled')return;
  if(experiment){experiment.status='error';experiment.metadata.status='error';experiment.metadata.error=e.message;}
  $('#experiment-status').textContent='エラーで中断 · 完了ペアは保存可能';showError(e);renderResults();lockExperiment(false);
 }finally{
  if(experiment?.status!=='running'&&experimentWorker){experimentWorker.terminate();experimentWorker=null;}
 }
}
function stopExperiment(){
 if(experiment?.status!=='running')return;
 experiment.status='stopped';experiment.metadata.status='stopped';experiment.metadata.completedGames=experiment.records.length;
 if(experimentWorker){experimentWorker.terminate();experimentWorker=null;}
 $('#experiment-status').textContent='中断 · 完了ペアのみ保存 / 区間推定は非表示';lockExperiment(false);renderResults();toast('実験を停止しました。完了した先後ペアは保存できます。');
}
function renderResults(){
 if(!experiment)return;const {records,metadata}=experiment,ids=metadata.ids||[],count=$('#result-count').value;
 const stats=summarize(records,ids,count,metadata.plannedComparisons,experiment.status==='complete');
 $('#export-csv').disabled=!records.length;$('#export-json').disabled=!records.length;
 $('#result-games').textContent=fmt(stats.games);$('#result-draw-rate').textContent=stats.games?pct(stats.draws/stats.games):'—';
 $('#result-seat-wins').textContent=stats.games?`${fmt(stats.firstWins)} / ${fmt(stats.secondWins)}`:'—';
 $('#result-certainty').textContent=experiment.status==='complete'?'FIXED RUN':experiment.status==='running'?'IN PROGRESS':'DESCRIPTIVE';
 const rows=stats.rows.filter(r=>r.games);
 $('#ranking-table tbody').innerHTML=rows.length?rows.map(r=>`<tr><td><b>${esc(r.id)}</b><small>${esc(describe(r.id).name)}</small></td><td><span class="rank-rate">${pct(r.rate)}<span class="tiny-bar"><i style="width:${100*r.rate}%"></i></span></span></td><td>${r.wins} / ${r.draws} / ${r.losses}</td><td>${r.meanCores.toFixed(2)}</td><td>${r.median.toFixed(2)} ms</td><td>${r.p95.toFixed(2)} ms</td><td>${fmt(Math.round(r.meanNodes))}</td></tr>`).join(''):'<tr><td colspan="7" class="empty-cell">まだ完了した対局がありません。</td></tr>';
 const pairFor=(a,b)=>stats.pairs.find(p=>p.ids.includes(a)&&p.ids.includes(b));
 $('#matrix-wrap').innerHTML=stats.games?`<table class="matrix-table"><thead><tr><th></th>${ids.map(id=>`<th>${esc(id)}</th>`).join('')}</tr></thead><tbody>${ids.map(a=>`<tr><th>${esc(a)}</th>${ids.map(b=>{if(a===b)return '<td class="diagonal">—</td>';const p=pairFor(a,b),v=p&&p.n?(p.ids[0]===a?p.mean:1-p.mean):NaN;return `<td style="${Number.isFinite(v)?`background:rgba(25,112,228,${.025+.21*v})`:''}" title="先後ペア ${p?.n||0}組">${Number.isFinite(v)?(v*100).toFixed(0)+'%':'—'}</td>`;}).join('')}</tr>`).join('')}</tbody></table>`:'<p class="empty-cell">完了した先後ペアから表示します。</p>';
 $('#confidence-list').innerHTML=stats.pairs.length?stats.pairs.map(p=>`<div class="confidence-item"><div class="confidence-label"><span>${esc(p.ids[0])} / ${esc(p.ids[1])}</span><span>${pct(p.mean)}</span></div>${p.low!==null?`<div class="confidence-bar"><span class="confidence-range" style="left:${p.low*100}%;width:${(p.high-p.low)*100}%"></span><span class="confidence-point" style="left:${p.mean*100}%"></span></div><small>${pct(p.low)} — ${pct(p.high)} · ${p.n}先後ペア · ${p.low>.5||p.high<.5?'0.5を含まない':'差は未確定'}</small>`:`<small>${p.n}先後ペア · ${count==='all'?'枚数混合の参考値。区間なし。':'完了前・中断・読み込み結果には推測用区間を表示しません。'}</small>`}</div>`).join(''):'<p class="empty-cell">全組み合わせの完了を待って、区間を評価します。</p>';
 $('#recent-games').innerHTML=records.length?records.map((g,i)=>({g,i})).filter(({g})=>count==='all'||g.mirrorCount===Number(count)).slice(-6).reverse().map(({g,i})=>`<div class="recent-game"><strong>${esc(g.players[0])} <b>${g.scores[0]} : ${g.scores[1]}</b> ${esc(g.players[1])}</strong><span>鏡${g.mirrorCount}枚 · ${g.turns}手 · seed ${g.boardSeed}</span><button class="text-button" data-replay-game="${i}">この対局を再生 →</button></div>`).join(''):'<p class="empty-cell">棋譜も結果と一緒に記録されます。</p>';
}
function download(name,text,type='application/json'){
 const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function saveReplay(){
 if(!game)return;
 const data={format:'laser-replay-v2',engine:engine.manifest.engine,wasmSHA256:engine.hash,createdAt:new Date().toISOString(),players:game.players,initial:Array.from(game.initial),history:game.history,options:game.options};
 download(`laser-replay-${info(game.initial).seed}-${info(game.initial).mirrorCount}.json`,JSON.stringify(data,null,2));
}
function openReplay(data){
 if(experiment?.status==='running'){toast('実験を停止してからリプレイしてください。');return;}
 if(!Array.isArray(data.initial)||data.initial.length!==443||data.initial.some(x=>!Number.isInteger(x)||x<-2147483648||x>4294967295))throw new Error('棋譜の初期盤面が不正です。');
 const initial=Int32Array.from(data.initial);if(!engine.valid(initial)||initial[0]!==0)throw new Error('初期盤面のルール検証に失敗しました。');
 if(!Array.isArray(data.players)||data.players.length!==2||data.players.some(x=>typeof x!=='string'||x.length>40)||!Array.isArray(data.history)||data.history.length>30)throw new Error('棋譜の参加者または手数が不正です。');
 let s=initial;const states=[initial],shots=[engine.trace(initial)],history=[];
 for(const raw of data.history){
  if(!Number.isInteger(raw.move)||info(s).finished)throw new Error('棋譜に不正な操作があります。');
  const v=info(s),out=engine.play(s,raw.move);
  history.push({...raw,turn:v.turn+1,player:v.player,ai:data.players[v.player],hits:out.hits,elapsed:Number.isFinite(raw.elapsed)&&raw.elapsed>=0?raw.elapsed:0,nodes:Number.isFinite(raw.nodes)&&raw.nodes>=0?raw.nodes:0,ratings:Array.isArray(raw.ratings)?raw.ratings.filter(Number.isFinite).slice(0,v.mirrorCount):[]});
  s=out.state;states.push(s);shots.push(out.shot);
 }
 cancelArena();game={initial,states,shots,history,cursor:0,players:data.players,certificate:null,readonly:true,options:data.options||options()};renderGame();showView('arena');toast('全操作を共通エンジンで再検証しました。▶で再生できます。');
}
async function loadFile(file){
 if(!file)return;if(file.size>25*1024*1024)throw new Error('読み込むJSONは25MB以下にしてください。');
 const data=JSON.parse(await file.text());
 if(data.format==='laser-replay-v2')return openReplay(data);
 if(data.format==='laser-experiment-v2'){
  if(experiment?.status==='running')throw new Error('実験を停止してから読み込んでください。');
  if(!data.metadata||!Array.isArray(data.records)||data.records.length>20000||!Array.isArray(data.metadata.ids)||data.metadata.ids.length<2||data.metadata.ids.length>50||new Set(data.metadata.ids).size!==data.metadata.ids.length||data.metadata.ids.some(x=>typeof x!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{1,31}$/.test(x)))throw new Error('実験JSONの形式が不正です。');
  for(const g of data.records){
   if(!Array.isArray(g.initial)||g.initial.length!==443||!Array.isArray(g.history)||g.history.length>30||!Array.isArray(g.players)||g.players.length!==2||!g.players.every(x=>data.metadata.ids.includes(x))||!Array.isArray(g.scores)||g.scores.length!==2||g.scores.some(x=>!Number.isInteger(x)||x<0||x>3)||g.scores[0]+g.scores[1]>3||!Number.isInteger(g.mirrorCount)||g.mirrorCount<6||g.mirrorCount>200)throw new Error('実験内の対局データが不正です。');
   if(g.initial.some(x=>!Number.isInteger(x)||x<-2147483648||x>4294967295)||!Number.isInteger(g.boardSeed)||g.boardSeed<0||g.boardSeed>4294967295||!Number.isInteger(g.turns)||g.turns<0||g.turns>30||typeof g.id!=='string'||!/^[A-Za-z0-9:_-]{1,120}$/.test(g.id))throw new Error('実験のシード・手数・識別子が不正です。');
   for(const h of g.history)for(const key of ['elapsed','nodes','evaluations','rollouts','graphVisits','ttHits','depth','considered','treeNodes','traceCalls']){
    if(h[key]!==undefined&&(!Number.isFinite(h[key])||h[key]<0||h[key]>Number.MAX_SAFE_INTEGER))throw new Error('計算量の記録は有限の非負数にしてください。');
   }
   // Recompute each imported result: never trust scores in an arbitrary JSON.
   let s=Int32Array.from(g.initial);if(!engine.valid(s)||s[0]!==0||info(s).mirrorCount!==g.mirrorCount)throw new Error('初期盤面が不正です。');
   for(const h of g.history){if(!Number.isInteger(h.move)||info(s).finished)throw new Error('操作列が不正です。');const v=info(s);if(h.player!==v.player)throw new Error('手番の記録が不正です。');s=engine.play(s,h.move,{trace:false}).state;}
   if(!info(s).finished||s[0]!==g.turns||s[1]!==g.scores[0]||s[2]!==g.scores[1])throw new Error('記録された勝敗と再生結果が一致しません。');
  }
  cancelArena();experiment={metadata:data.metadata,records:data.records,status:'imported',completed:data.records.length,total:data.metadata.totalGames||data.records.length};
  const counts=[...new Set(data.records.map(g=>g.mirrorCount))].sort((a,b)=>a-b);
  $('#result-count').innerHTML=counts.map(n=>`<option value="${n}">${n}枚</option>`).join('')+'<option value="all">全枚数（参考）</option>';
  $('#experiment-status').textContent='保存結果を読み込み · 勝敗を再検証 / 記述統計';$('#progress-label').textContent=`${fmt(data.records.length)} games`;// Imported logs are not authenticated original fixed-horizon runs.\n
  $('#progress-fill').style.width='100%';renderResults();showView('lab');toast('保存結果の勝敗を再検証しました。各対局をリプレイできます。');return;
 }
 throw new Error('この版はlaser-replay-v2 / laser-experiment-v2のJSONに対応しています。');
}
function bind(){
 document.addEventListener('click',e=>{
  const view=e.target.closest('[data-view]');if(view)showView(view.dataset.view);
  const detail=e.target.closest('[data-agent]');if(detail)showAgent(detail.dataset.agent);
  const use=e.target.closest('[data-use-agent]');if(use){$('#agent-dialog').close();$('#player-second').value=use.dataset.useAgent;newGame();showView('arena');}
  const seekButton=e.target.closest('[data-seek]');if(seekButton)seek(Number(seekButton.dataset.seek));
  const replay=e.target.closest('[data-replay-game]');if(replay&&experiment)try{openReplay(experiment.records[Number(replay.dataset.replayGame)]);}catch(error){showError(error);}
 });
 for(const d of $$('dialog')){d.querySelector('.dialog-close').addEventListener('click',()=>d.close());d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});}
 $('#new-game').addEventListener('click',newGame);$('#mirror-range').addEventListener('input',e=>updateMirrors(e.target.value));$('#mirror-count').addEventListener('input',e=>updateMirrors(e.target.value));
 for(const b of $$('[data-mirrors]'))b.addEventListener('click',()=>updateMirrors(b.dataset.mirrors));
 $('#random-seed').addEventListener('click',()=>{$('#board-seed').value=crypto.getRandomValues(new Uint32Array(1))[0];});
 $('#play-pause').addEventListener('click',()=>{
  if(!game)return;if(autoplay){autoplay=false;clearTimeout(timer);renderGame();return;}
  if(info(game.states[game.cursor]).finished&&!game.readonly)newGame();autoplay=true;renderGame();advance();
 });
 $('#step-forward').addEventListener('click',()=>{autoplay=false;clearTimeout(timer);advance();});
 $('#play-speed').addEventListener('change',schedule);
 $('#previous-turn').addEventListener('click',()=>seek(game.cursor-1));$('#next-turn').addEventListener('click',()=>seek(game.cursor+1));
 $('#replay-position').addEventListener('input',e=>seek(Number(e.target.value)));
 $('#show-beams').addEventListener('change',e=>{board.options.beams=e.target.checked;board.draw();});
 $('#show-heatmap').addEventListener('change',e=>{board.options.heatmap=e.target.checked;board.draw();if(e.target.checked)toast('候補評価は各AI独自の尺度です。AI間で数値を直接比較しないでください。');});
 $('#show-certificate').addEventListener('click',showCertificate);$('#save-replay').addEventListener('click',saveReplay);
 $('#load-file').addEventListener('change',async e=>{try{await loadFile(e.target.files?.[0]);}catch(error){showError(error);}e.target.value='';});
 $('#agent-search').addEventListener('input',renderAtlas);
 for(const b of $$('[data-family]'))b.addEventListener('click',()=>{currentFamily=b.dataset.family;for(const x of $$('[data-family]'))x.classList.toggle('selected',x===b);renderAtlas();});
 $('#select-all-agents').addEventListener('click',()=>{$$('#experiment-agents input').forEach(x=>x.checked=true);updatePlan();});
 $('#clear-agents').addEventListener('click',()=>{$$('#experiment-agents input').forEach(x=>x.checked=false);updatePlan();});
 $('#experiment-agents').addEventListener('change',updatePlan);
 for(const id of ['experiment-counts','experiment-boards','experiment-seed','max-depth','beam-width','think-budget'])$(`#${id}`).addEventListener('input',updatePlan);
 $('#run-experiment').addEventListener('click',runExperiment);$('#stop-experiment').addEventListener('click',stopExperiment);$('#result-count').addEventListener('change',renderResults);
 $('#export-csv').addEventListener('click',()=>{if(experiment)download('laser-ai-results.csv',gameCSV(experiment.records),'text/csv;charset=utf-8');});
 $('#export-json').addEventListener('click',()=>{if(experiment)download('laser-ai-experiment.json',JSON.stringify({format:'laser-experiment-v2',metadata:{...experiment.metadata,status:experiment.status},records:experiment.records},null,2));});
 window.addEventListener('beforeunload',e=>{if(experiment?.status==='running'){e.preventDefault();e.returnValue='';}});
}
async function boot(){
 bind();
 try{
  engine=await Engine.load();agents=agentsFor(engine);$('#agent-count').textContent=agents.length;
  const list='<option value="HUMAN">人間 / YOU</option>'+agents.map(a=>`<option value="${esc(a.id)}">${esc(a.id)} · ${esc(a.name)}</option>`).join('');
  $('#player-first').innerHTML=list;$('#player-second').innerHTML=list;$('#player-first').value='AI01';$('#player-second').value='AI03';
  $('#player-first').disabled=false;$('#player-second').disabled=false;$('#new-game').disabled=false;
  $('#experiment-agents').innerHTML=agents.map((a,i)=>`<label class="agent-check"><input type="checkbox" value="${esc(a.id)}" ${['AI01','AI07'].includes(a.id)?'checked':''}><span><b>${esc(a.id)}</b><small>${esc(a.name)}</small></span></label>`).join('');
  $('#engine-status').innerHTML='<i></i> ENGINE ONLINE';renderAtlas();newGame();
 }catch(error){$('#engine-status').textContent='ENGINE ERROR';$('#board-loading').hidden=true;showError(error);}
}
boot();
