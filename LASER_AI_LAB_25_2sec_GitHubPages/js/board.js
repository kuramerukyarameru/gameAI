import {info,coordinate} from '../runtime/engine.js';
/** Retina Canvas renderer. No physics are duplicated here. */
export class Board {
 constructor(canvas,onMirror){
  this.canvas=canvas;this.ctx=canvas.getContext('2d');this.onMirror=onMirror;this.hover=-1;this.keyboard=112;this.options={beams:true,heatmap:false};this.shot=null;this.state=null;this.lastMove=-1;this.ratings=[];this.animStart=0;
  this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);
  canvas.addEventListener('pointermove',e=>{let p=this.cell(e);if(p!==this.hover){this.hover=p;this.draw();}this.tooltip(e,p);});
  canvas.addEventListener('pointerleave',()=>{this.hover=-1;document.querySelector('#board-tooltip').hidden=true;this.draw();});
  canvas.addEventListener('click',e=>this.activate(this.cell(e)));
  canvas.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' '].includes(e.key)){e.preventDefault();let x=this.keyboard%15,y=Math.floor(this.keyboard/15);if(e.key==='ArrowUp')y=Math.max(0,y-1);if(e.key==='ArrowDown')y=Math.min(14,y+1);if(e.key==='ArrowLeft')x=Math.max(0,x-1);if(e.key==='ArrowRight')x=Math.min(14,x+1);this.keyboard=y*15+x;this.hover=this.keyboard;if(e.key==='Enter'||e.key===' ')this.activate(this.keyboard);this.draw();}});
 }
 resize(){let w=this.canvas.getBoundingClientRect().width;if(w<1)return;let dpr=Math.min(devicePixelRatio||1,2.5);this.width=w;this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(w*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);this.draw();}
 cell(e){const r=this.canvas.getBoundingClientRect(),p=this.padding(),c=this.cellSize(),x=Math.floor((e.clientX-r.left-p)/c),y=Math.floor((e.clientY-r.top-p)/c);return x>=0&&x<15&&y>=0&&y<15?y*15+x:-1;}
 padding(){return (this.width||600)*.045;}
 cellSize(){return ((this.width||600)-2*this.padding())/15;}
 activate(p){if(!this.state||p<0)return;const m=Array.from(info(this.state).mirrors).indexOf(p);if(m>=0)this.onMirror(m);}
 tooltip(e,p){const box=document.querySelector('#board-tooltip');if(!this.state||p<0){box.hidden=true;return;}const v=info(this.state),m=Array.from(v.mirrors).indexOf(p);if(m<0){box.hidden=true;return;}box.textContent=`${coordinate(p)} / MIRROR ${String(m+1).padStart(3,'0')}`;box.hidden=false;const r=this.canvas.getBoundingClientRect();box.style.left=`${Math.min(e.clientX-r.left+12,r.width-150)}px`;box.style.top=`${Math.max(0,e.clientY-r.top-30)}px`;}
 set(state,shot,lastMove=-1,ratings=[],animate=false){this.state=state;this.shot=shot;this.lastMove=lastMove;this.ratings=ratings||[];this.animStart=animate&&!this.reduced?performance.now():0;this.draw();if(this.animStart)this.animate();}
 animate(){if(this.raf)cancelAnimationFrame(this.raf);const frame=()=>{this.draw();if(performance.now()-this.animStart<650)this.raf=requestAnimationFrame(frame);};this.raf=requestAnimationFrame(frame);}
 draw(){
  if(!this.width)return;const c=this.ctx,w=this.width,p=this.padding(),u=this.cellSize();c.clearRect(0,0,w,w);if(!this.state)return;
  const v=info(this.state),cx=x=>p+(x+.5)*u,cy=y=>p+(y+.5)*u;
  c.fillStyle='#f6faff';c.fillRect(p,p,u*15,u*15);
  for(let y=0;y<15;y++)for(let x=0;x<15;x++)if((x+y)%2===0){c.fillStyle='#f0f6fd';c.fillRect(p+x*u,p+y*u,u,u);}
  c.lineWidth=.7;c.strokeStyle='#dfebf8';c.beginPath();for(let k=0;k<=15;k++){c.moveTo(p+k*u,p);c.lineTo(p+k*u,p+15*u);c.moveTo(p,p+k*u);c.lineTo(p+15*u,p+k*u);}c.stroke();
  c.fillStyle='#9cacc0';c.font=`${Math.max(6,w*.012)}px ui-monospace,monospace`;c.textAlign='center';c.textBaseline='middle';for(let k=0;k<15;k++){c.fillText(String.fromCharCode(65+k),cx(k),p*.43);c.fillText(String(k+1),p*.4,cy(k));}
  if(this.options.heatmap&&this.ratings.length){const vals=this.ratings.filter(Number.isFinite),lo=Math.min(...vals),hi=Math.max(...vals);if(hi>lo)for(let m=0;m<v.mirrorCount;m++){const cell=v.mirrors[m],t=(this.ratings[m]-lo)/(hi-lo);c.fillStyle=`rgba(28,119,232,${.03+t*.28})`;c.fillRect(p+(cell%15)*u,p+Math.floor(cell/15)*u,u,u);}}
  if(this.lastMove>=0&&this.lastMove<v.mirrorCount){let cell=v.mirrors[this.lastMove];c.fillStyle='#d7eaff';c.fillRect(p+cell%15*u,p+Math.floor(cell/15)*u,u,u);c.strokeStyle='#76a9eb';c.lineWidth=1.4;c.strokeRect(p+cell%15*u+1.5,p+Math.floor(cell/15)*u+1.5,u-3,u-3);}
  if(this.hover>=0){c.fillStyle='#c8e2ff60';c.fillRect(p+this.hover%15*u,p+Math.floor(this.hover/15)*u,u,u);}
  // Metal mirror backplates; thin central highlights keep a 200-mirror board readable.
  for(let m=0;m<v.mirrorCount;m++){let cell=v.mirrors[m],x=cx(cell%15),y=cy(Math.floor(cell/15)),a=u*.27,k=v.board[cell];
   c.strokeStyle='#d4e1ef';c.lineWidth=Math.max(3,u*.17);c.lineCap='round';c.beginPath();if(k===1){c.moveTo(x-a,y+a);c.lineTo(x+a,y-a);}else{c.moveTo(x-a,y-a);c.lineTo(x+a,y+a);}c.stroke();
   c.strokeStyle=m===this.lastMove?'#247adf':'#93aac4';c.lineWidth=Math.max(1,u*.055);c.stroke();c.strokeStyle='#ffffff';c.lineWidth=Math.max(.5,u*.025);c.stroke();
  }
  if(this.options.beams&&this.shot){
   const progress=this.animStart?Math.min(1,(performance.now()-this.animStart)/430):1;
   c.save();c.beginPath();c.rect(p-u*.15,p-u*.15,15*u+u*.3,15*u+u*.3);c.clip();
   for(const beam of this.shot.beams){
    if(beam.points.length<2)continue;const steps=(beam.points.length-1)*progress;
    c.beginPath();c.moveTo(cx(beam.points[0][0]),cy(beam.points[0][1]));
    for(let i=1;i<beam.points.length&&i<=Math.ceil(steps);i++){let b=beam.points[i],a=beam.points[i-1],t=Math.min(1,Math.max(0,steps-i+1));c.lineTo(cx(a[0]+(b[0]-a[0])*t),cy(a[1]+(b[1]-a[1])*t));}
    c.lineJoin='round';c.lineCap='round';c.strokeStyle='#ed429832';c.lineWidth=Math.max(3,u*.20);c.shadowBlur=10;c.shadowColor='#ed429866';c.stroke();c.shadowBlur=0;c.strokeStyle='#ed4298';c.lineWidth=Math.max(1.2,u*.06);c.stroke();c.strokeStyle='#fff2f9b0';c.lineWidth=.55;c.stroke();
   }c.restore();
  }
  for(let b=0;b<3;b++){
   let cell=v.sources[b],x=cx(cell%15),y=cy(Math.floor(cell/15));c.save();c.translate(x,y);c.rotate(v.directions[b]*Math.PI/2);
   c.fillStyle='#e2efff';c.strokeStyle='#b5d3f8';c.lineWidth=1;c.beginPath();c.roundRect(-u*.35,-u*.35,u*.7,u*.7,u*.15);c.fill();c.stroke();c.fillStyle='#2879df';c.beginPath();c.moveTo(0,-u*.25);c.lineTo(-u*.2,u*.17);c.lineTo(u*.2,u*.17);c.closePath();c.fill();c.restore();
  }
  for(let k=0;k<3;k++){
   let cell=v.cores[k],x=cx(cell%15),y=cy(Math.floor(cell/15)),owner=v.owners[k],hit=this.shot?.hits&(1<<k);
   c.save();c.translate(x,y);c.rotate(Math.PI/4);c.fillStyle=owner===0?'#2479e3':owner===1?'#3eafc7':'#fff3d7';c.strokeStyle=owner===0?'#1166d6':owner===1?'#2997ad':'#d3ad69';c.lineWidth=1.2;if(hit){c.shadowColor='#ed429880';c.shadowBlur=13;}c.beginPath();c.roundRect(-u*.23,-u*.23,u*.46,u*.46,u*.055);c.fill();c.stroke();c.shadowBlur=0;c.fillStyle=owner<0?'#e1b767':'#fff';c.fillRect(-u*.07,-u*.07,u*.14,u*.14);c.restore();
  }
 }
}
