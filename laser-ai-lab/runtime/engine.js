/** Thin bindings; all game rules and both built-in AIs live in AI.cpp. */
export const SIZE = 15, MIRRORS = 100, TURN_LIMIT = 30;
export const ABI = Object.freeze({turn:0,score:1,seed:3,board:4,mirrors:229,sources:329,directions:332,cores:335,owners:338,length:341});
export class Engine {
  static async load(url = new URL('./AI.wasm', import.meta.url)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`AI.wasm: HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    return Engine.fromBytes(bytes);
  }
  static async fromBytes(bytes) {
    const { instance } = await WebAssembly.instantiate(bytes, {});
    let hash = 'unavailable';
    if (globalThis.crypto?.subtle) {
      hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    }
    return new Engine(instance.exports, hash);
  }
  constructor(exports, hash) {
    this.api = exports;
    this.hash = hash;
    if (exports.state_size() !== ABI.length) throw new Error('Unsupported state ABI');
    const pointer = exports.agent_manifest();
    const bytes = new Uint8Array(exports.memory.buffer);
    let end = pointer; while (bytes[end]) end++;
    this.manifest = JSON.parse(new TextDecoder().decode(bytes.subarray(pointer, end)));
  }
  get ints() { return new Int32Array(this.api.memory.buffer); }
  write(state) {
    if (!(state instanceof Int32Array) || state.length !== ABI.length) throw new Error('Invalid state buffer');
    this.ints.set(state, this.api.state_ptr()/4);
  }
  read() { const p=this.api.state_ptr()/4; return this.ints.slice(p,p+ABI.length); }
  valid(state) { this.write(state); return Boolean(this.api.validate_state()); }
  generate(seed) {
    if (!this.api.make_board(seed>>>0)) throw new Error('Could not generate a certified board. Try another seed.');
    const p=this.api.certificate_ptr()/4, data=this.ints;
    const certificate=Array.from({length:3},(_,i)=>Array.from(data.subarray(p+i*102+1,p+i*102+1+data[p+i*102])));
    return {state:this.read(), certificate, attempts:this.api.generation_attempts()};
  }
  decodeTrace() {
    const data=this.ints;let p=this.api.trace_ptr()/4;
    const hits=data[p++], beams=[];
    for(let b=0;b<3;b++){
      const length=data[p++], stop=data[p++], points=[];
      for(let j=0;j<length;j++)points.push([data[p++],data[p++]]);
      beams.push({points,stop});
    }
    return {hits,beams};
  }
  trace(state) { this.write(state);this.api.fire();return this.decodeTrace(); }
  play(state,move,{trace=true}={}) {
    this.write(state);
    const hits=this.api.play(move);
    if(hits<0)throw new Error(`Illegal move: ${move}`);
    return {state:this.read(),hits,shot:trace?this.decodeTrace():null};
  }
  choose(index,state,seed,budget=12000) {
    if(!Number.isInteger(budget)||budget<1000||budget>10000000)throw new Error('Budget must be an integer between 1000 and 10000000');
    this.write(state);
    const started=performance.now();
    const move=this.api.choose_ai(index,seed>>>0,budget);
    const elapsed=performance.now()-started;
    if(move<0||move>=MIRRORS)throw new Error(`AI returned an invalid move: ${move}`);
    const p=this.api.diagnostics_ptr()/4, d=this.ints.slice(p,p+108);
    return {move,elapsed,simulations:d[1],graphVisits:d[2],planSteps:d[3],immediate:d[4],reply:d[5],considered:d[6],budgetHit:Boolean(d[7]),ratings:Array.from(d.subarray(8))};
  }
}
export function info(state) {
  return {
    turn:state[0], player:state[0]%2, scores:[state[1],state[2]], seed:state[3]>>>0,
    board:state.subarray(4,229), mirrors:state.subarray(229,329),
    sources:state.subarray(329,332), directions:state.subarray(332,335),
    cores:state.subarray(335,338), owners:state.subarray(338,341),
    finished:state[0]>=30||state[1]+state[2]===3
  };
}
export function coordinate(cell) { return `${String.fromCharCode(65+cell%15)}${1+Math.floor(cell/15)}`; }
export function seedFrom(value) {
  if (/^\d+$/.test(String(value).trim())) return Number(BigInt(String(value).trim()) & 0xffffffffn)>>>0;
  let h=2166136261;
  for(const c of String(value)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
export function random(seed) {
  let s=seed>>>0||0x9e3779b9;
  return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return s>>>0;};
}
export function combine(...values) { return seedFrom(values.join(':')); }
