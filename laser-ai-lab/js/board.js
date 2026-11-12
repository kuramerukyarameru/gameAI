import { info, coordinate } from '../runtime/engine.js';
const W=760, PAD=32, CELL=(W-PAD*2)/15;
const BEAMS=['#d2f784','#b5a0ed','#8fd5dc'];
const OWNERS=['#d2f784','#efa48d'];
export class Board {
  constructor(canvas,{onSelect,onHover,canInteract}) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.onSelect=onSelect;this.onHover=onHover;this.canInteract=canInteract;
    this.hover=-1;this.focus=112;this.showBeams=true;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    canvas.addEventListener('pointermove',e=>{const p=this.cellFromEvent(e);if(p!==this.hover){this.hover=p;this.notifyHover(p);this.draw();}});
    canvas.addEventListener('pointerleave',()=>{this.hover=-1;this.onHover?.(null);this.draw();});
    canvas.addEventListener('click',e=>{const cell=this.cellFromEvent(e);if(cell>=0){this.focus=cell;const m=this.state?info(this.state).mirrors.indexOf(cell):-1;if(m>=0)this.onSelect(m);this.draw();}});
    canvas.addEventListener('keydown',e=>{
      let x=this.focus%15,y=Math.floor(this.focus/15);
      if(e.key==='ArrowUp')y=Math.max(0,y-1);else if(e.key==='ArrowDown')y=Math.min(14,y+1);else if(e.key==='ArrowLeft')x=Math.max(0,x-1);else if(e.key==='ArrowRight')x=Math.min(14,x+1);
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();const m=this.state?info(this.state).mirrors.indexOf(this.focus):-1;if(m>=0)this.onSelect(m);return;}else return;
      e.preventDefault();this.focus=y*15+x;this.hover=this.focus;this.notifyHover(this.focus);this.draw();
    });
    canvas.addEventListener('focus',()=>this.draw());canvas.addEventListener('blur',()=>this.draw());
    this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(canvas);
  }
  notifyHover(p){
    if(!this.state||p<0){this.onHover?.(null);return;}
    const data=info(this.state),mirror=data.mirrors.indexOf(p);
    this.canvas.style.cursor=mirror>=0&&this.canInteract()?'pointer':'default';
    this.onHover?.({cell:p,mirror,kind:data.board[p],coordinate:coordinate(p)});
  }
  cellFromEvent(e){const r=this.canvas.getBoundingClientRect(),x=(e.clientX-r.left)*W/r.width,y=(e.clientY-r.top)*W/r.height;const col=Math.floor((x-PAD)/CELL),row=Math.floor((y-PAD)/CELL);return col>=0&&col<15&&row>=0&&row<15?row*15+col:-1;}
  set(state,shot,{move=-1,animate=false}={}){
    this.previous=this.state;this.state=state;this.shot=shot;this.lastMove=move;
    this.started=animate&&!this.reduced?performance.now():0;
    this.draw();
  }
  draw(){
    if(!this.state||!this.canvas.clientWidth)return;
    cancelAnimationFrame(this.frame);
    const rect=this.canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2),pixels=Math.round(rect.width*ratio);
    if(this.canvas.width!==pixels||this.canvas.height!==pixels){this.canvas.width=pixels;this.canvas.height=pixels;}
    const c=this.ctx;c.setTransform(pixels/W,0,0,pixels/W,0,0);c.clearRect(0,0,W,W);
    const d=info(this.state),elapsed=this.started?performance.now()-this.started:10000;
    const progress=Math.min(1,Math.max(0,elapsed/420));
    c.fillStyle='#0e161c';c.fillRect(0,0,W,W);
    c.fillStyle='#101a22';c.fillRect(PAD,PAD,CELL*15,CELL*15);
    for(let y=0;y<15;y++)for(let x=0;x<15;x++){
      if((x+y)%2===0){c.fillStyle='#12202a33';c.fillRect(PAD+x*CELL,PAD+y*CELL,CELL,CELL);}
    }
    c.strokeStyle='#21313c';c.lineWidth=.65;
    c.beginPath();for(let i=0;i<=15;i++){let z=PAD+i*CELL;c.moveTo(z,PAD);c.lineTo(z,W-PAD);c.moveTo(PAD,z);c.lineTo(W-PAD,z);}c.stroke();
    c.strokeStyle='#35434d';c.lineWidth=1;c.strokeRect(PAD,PAD,CELL*15,CELL*15);
    c.font='10px ui-monospace, Consolas, monospace';c.fillStyle='#607783';c.textAlign='center';c.textBaseline='middle';
    for(let i=0;i<15;i++){const a=PAD+(i+.5)*CELL;c.fillText(String.fromCharCode(65+i),a,16);c.fillText(String(i+1),16,a);c.fillText(String.fromCharCode(65+i),a,W-15);c.fillText(String(i+1),W-15,a);}
    const last=this.lastMove>=0?d.mirrors[this.lastMove]:-1;
    for(const p of [last,this.hover])if(p>=0){const x=PAD+p%15*CELL,y=PAD+Math.floor(p/15)*CELL;c.fillStyle=p===last?'#d2f78412':'#8fd5dc10';c.fillRect(x+1,y+1,CELL-2,CELL-2);c.strokeStyle=p===last?'#d2f78488':'#8fd5dc66';c.lineWidth=1;c.strokeRect(x+3,y+3,CELL-6,CELL-6);}
    if(document.activeElement===this.canvas){const x=PAD+this.focus%15*CELL,y=PAD+Math.floor(this.focus/15)*CELL;c.strokeStyle='#e5f4d8';c.lineWidth=1.5;c.setLineDash([3,3]);c.strokeRect(x+2,y+2,CELL-4,CELL-4);c.setLineDash([]);}
    if(this.showBeams&&this.shot){
      c.save();c.beginPath();c.rect(PAD,PAD,15*CELL,15*CELL);c.clip();
      for(let b=0;b<this.shot.beams.length;b++){
        const points=this.shot.beams[b].points;if(points.length<2)continue;
        const length=(points.length-1)*progress;
        const path=()=>{c.beginPath();c.moveTo(PAD+(points[0][0]+.5)*CELL,PAD+(points[0][1]+.5)*CELL);for(let i=1;i<points.length;i++){const fraction=Math.min(1,length-i+1);if(fraction<=0)break;const x=points[i-1][0]+(points[i][0]-points[i-1][0])*fraction,y=points[i-1][1]+(points[i][1]-points[i-1][1])*fraction;c.lineTo(PAD+(x+.5)*CELL,PAD+(y+.5)*CELL);}};
        c.strokeStyle=BEAMS[b];c.lineCap='round';c.lineJoin='round';c.globalAlpha=.1;c.lineWidth=9;path();c.stroke();
        c.globalAlpha=.72;c.lineWidth=2;path();c.stroke();
        c.globalAlpha=.8;c.lineWidth=.7;c.strokeStyle='#f6ffe4';path();c.stroke();
      }
      c.restore();
    }
    for(let m=0;m<100;m++){
      const p=d.mirrors[m],x=PAD+(p%15+.5)*CELL,y=PAD+(Math.floor(p/15)+.5)*CELL,kind=d.board[p];
      let angle=kind===1?-Math.PI/4:Math.PI/4;
      if(p===last&&elapsed<210&&this.previous){const old=info(this.previous).board[p];if(old!==kind){const t=1-(1-Math.min(1,elapsed/210))**3;angle=(old===1?-Math.PI/4:Math.PI/4)+Math.PI/2*t;}}
      c.save();c.translate(x,y);c.rotate(angle);
      c.strokeStyle=p===last?'#d2f784':'#90a7b6';c.lineWidth=4.2;c.lineCap='round';c.beginPath();c.moveTo(-CELL*.24,0);c.lineTo(CELL*.24,0);c.stroke();
      c.strokeStyle=p===last?'#f0ffd6':'#cfdee5';c.lineWidth=1.1;c.beginPath();c.moveTo(-CELL*.22,-.7);c.lineTo(CELL*.22,-.7);c.stroke();
      c.fillStyle='#405c69';for(const sign of [-1,1]){c.beginPath();c.arc(CELL*.24*sign,0,2.2,0,Math.PI*2);c.fill();}c.restore();
    }
    for(let b=0;b<3;b++){
      const p=d.sources[b],x=PAD+(p%15+.5)*CELL,y=PAD+(Math.floor(p/15)+.5)*CELL;
      c.save();c.translate(x,y);c.fillStyle='#152731';c.strokeStyle=BEAMS[b];c.lineWidth=1.2;c.beginPath();c.roundRect(-CELL*.31,-CELL*.31,CELL*.62,CELL*.62,6);c.fill();c.stroke();
      c.rotate(d.directions[b]*Math.PI/2);c.fillStyle=BEAMS[b];c.beginPath();c.moveTo(0,-CELL*.21);c.lineTo(CELL*.17,CELL*.12);c.lineTo(-CELL*.17,CELL*.12);c.closePath();c.fill();c.restore();
    }
    for(let k=0;k<3;k++){
      const p=d.cores[k],x=PAD+(p%15+.5)*CELL,y=PAD+(Math.floor(p/15)+.5)*CELL,owner=d.owners[k];
      const capturedNow=this.shot&&Boolean(this.shot.hits&(1<<k));
      c.save();c.translate(x,y);c.globalAlpha=owner<0?1:(capturedNow?.85:.28);c.fillStyle=owner<0?'#19383f':OWNERS[owner]+'22';c.strokeStyle=owner<0?'#8fd5dc':OWNERS[owner];c.lineWidth=1.7;
      c.beginPath();c.moveTo(0,-CELL*.31);c.lineTo(CELL*.29,0);c.lineTo(0,CELL*.31);c.lineTo(-CELL*.29,0);c.closePath();c.fill();c.stroke();
      c.fillStyle=owner<0?'#b7eff1':OWNERS[owner];c.font='bold 12px ui-monospace, Consolas, monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(owner<0?String(k+1):'✓',0,.5);c.restore();
    }
    if(this.started&&elapsed<500)this.frame=requestAnimationFrame(()=>this.draw());
  }
}