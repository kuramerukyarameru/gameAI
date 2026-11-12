/** All rules and 25 built-in agents execute in the same C++/Wasm engine. */
export const SIZE=15,MAX_MIRRORS=200,MIN_MIRRORS=6,TURN_LIMIT=30;
export const ABI=Object.freeze({turn:0,score:1,seed:3,count:4,kind:5,board:6,mirrors:231,sources:431,directions:434,cores:437,owners:440,length:443});
export class Engine {
  static async load(url=new URL('./AI.wasm',import.meta.url)) {
    const response=await fetch(url);if(!response.ok)throw new Error(`AI.wasm: HTTP ${response.status}. Upload the runtime folder too.`);
    return Engine.fromBytes(await response.arrayBuffer());
  }
  static async fromBytes(bytes) {
    const {instance}=await WebAssembly.instantiate(bytes,{env:{lab_now:()=>performance.now(),log:Math.log,exp:Math.exp,sqrt:Math.sqrt}});
    let hash='unavailable';if(globalThis.crypto?.subtle)hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    return new Engine(instance.exports,hash);
  }
  constructor(api,hash){
    this.api=api;this.hash=hash;if(api.state_size()!==ABI.length)throw new Error('Unsupported state ABI');
    const b=new Uint8Array(api.memory.buffer);let p=api.agent_manifest(),end=p;while(b[end])end++;
    this.manifest=JSON.parse(new TextDecoder().decode(b.subarray(p,end)));
  }
  get ints(){return new Int32Array(this.api.memory.buffer);}
  read(){let p=this.api.state_ptr()/4;return this.ints.slice(p,p+ABI.length);}
  write(s){if(!(s instanceof Int32Array)||s.length!==ABI.length)throw new Error('Invalid state');this.ints.set(s,this.api.state_ptr()/4);}
  valid(s){this.write(s);return Boolean(this.api.validate_state());}
  generate(seed,count=100){
    if(!Number.isInteger(count)||count<MIN_MIRRORS||count>MAX_MIRRORS)throw new Error('Mirror count must be 6..200.');
    if(!this.api.make_board(seed>>>0,count))throw new Error('Could not certify this board. Try a different seed.');
    let p=this.api.certificate_ptr()/4,d=this.ints;
    const certificate=Array.from({length:3},(_,i)=>Array.from(d.subarray(p+i*202+1,p+i*202+1+d[p+i*202])));
    return {state:this.read(),certificate,attempts:this.api.generation_attempts()};
  }
  decodeTrace(){let p=this.api.trace_ptr()/4,d=this.ints,hits=d[p++],beams=[];
    for(let b=0;b<3;b++){const length=d[p++],stop=d[p++],points=[];for(let k=0;k<length;k++)points.push([d[p++],d[p++]]);beams.push({points,stop});}return {hits,beams};}
  trace(s){this.write(s);this.api.fire();return this.decodeTrace();}
  play(s,move,{trace=true}={}){this.write(s);let hits=this.api.play(move);if(hits<0)throw new Error(`Illegal move: ${move}`);return {state:this.read(),hits,shot:trace?this.decodeTrace():null};}
  features(s,root=0){this.write(s);return Array.from(new Float64Array(this.api.memory.buffer,this.api.feature_ptr(root),10));}
  choose(index,s,seed,options={}){
    const {nodes=2000000,millis=2,depth=3,width=6}=options;
    if(!Number.isInteger(nodes)||nodes<1000||nodes>2000000)throw new Error('Node budget out of range');
    if(!Number.isInteger(millis)||millis<0||millis>10000||!Number.isInteger(depth)||depth<1||depth>10||!Number.isInteger(width)||width<1||width>200)throw new Error('Invalid search configuration');
    this.write(s);const start=performance.now(),move=this.api.choose_ai(index,seed>>>0,nodes,millis,depth,width),elapsed=performance.now()-start;
    if(move<0||move>=s[ABI.count])throw new Error(`AI returned invalid move ${move}`);
    const p=this.api.diagnostics_ptr()/4,d=this.ints.slice(p,p+212);
    return {move,elapsed,nodes:d[1],evaluations:d[2],rollouts:d[3],depth:d[4],considered:d[5],budgetHit:Boolean(d[6]),graphVisits:d[7],ttHits:d[8],proof:d[9],treeNodes:d[10],traceCalls:d[11],ratings:Array.from(d.subarray(12,12+s[ABI.count]))};
  }
}
export function info(s){return {turn:s[0],player:s[0]%2,scores:[s[1],s[2]],seed:s[3]>>>0,mirrorCount:s[4],generatorKind:s[5],board:s.subarray(6,231),mirrors:s.subarray(231,231+s[4]),sources:s.subarray(431,434),directions:s.subarray(434,437),cores:s.subarray(437,440),owners:s.subarray(440,443),finished:s[0]>=30||s[1]+s[2]===3};}
export function coordinate(p){return `${String.fromCharCode(65+p%15)}${1+Math.floor(p/15)}`;}
export function seedFrom(value){if(/^\d+$/.test(String(value).trim()))return Number(BigInt(String(value).trim())&0xffffffffn)>>>0;let h=2166136261;for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function combine(...a){return seedFrom(a.join(':'));}
export function random(seed){let x=seed>>>0||0x9e3779b9;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};}
