// Actual production SDK/controller over a byte-level device model. Never selects OS devices.
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {MemoryPort} from './security-memory-port.mjs';
const root=new URL('../',import.meta.url),out=process.argv[2];assert.ok(out,'Pass a new report directory');await mkdir(out);const engine=await readFile(new URL('real-flash/engine.js',root)),sha=b=>createHash('sha256').update(b).digest('hex'),{loadOwnerPolicy,createController}=await import(new URL('real-flash/engine.js',root));const ownerBytes=await readFile(new URL('firmware-target.json',root)),owner=JSON.parse(ownerBytes),files=new Map([['firmware-target.json',ownerBytes]]);for(const item of [owner.target.manifest,...Object.values(owner.target.images)])files.set(item.url,await readFile(new URL(item.url,root)));
let selected;globalThis.isSecureContext=true;Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>selected}});Object.defineProperty(navigator,'userActivation',{configurable:true,value:{isActive:true}});globalThis.fetch=async url=>{const k=[...files.keys()].find(k=>String(url).endsWith('/'+k));assert.ok(k);return new Response(files.get(k));};
const encode=b=>{const a=[192];for(const x of b)a.push(...x===192?[219,220]:x===219?[219,221]:[x]);a.push(192);return Uint8Array.from(a);};const decode=w=>{const a=[];for(let i=1;i<w.length-1;i++){if(w[i]===219)a.push(w[++i]===220?192:219);else a.push(w[i]);}return a;};
class HandoffPort extends MemoryPort{
 constructor(mode){super(new Uint8Array(16777216).fill(255),{security:{apiVersion:0,purposes:[0,0,0,0,0,0,12],romStatus4:true}});this.mode=mode;this.frames=null;this.timers=[];this.registers.set(0x60007044,0);this.registers.set(0x60007048,0x0201);}
 emit(b){if(this.frames)this.frames.push(b.slice());else super.emit(b);}
 schedule(fn,ms){this.timers.push(setTimeout(()=>{if(!this.closed)fn();},ms));}
 async receive(wire){const p=decode(wire);if(p[1]!==6)return super.receive(wire);this.frames=[];await super.receive(wire);let [ack,greeting]=this.frames;this.frames=null;this.events.push({type:'handoff-injection',mode:this.mode});
  if(this.mode.startsWith('status-length-')){const n=Number(this.mode.split('-').at(-1));ack=new Uint8Array(8+n);ack[0]=1;ack[1]=6;ack[2]=n;}
  if(this.mode==='wrong-op')ack[1]=21;
  if(this.mode==='error-ack')ack[8]=1;
  if(this.mode==='late-error-ack'){ack[8]=1;super.emit(greeting);this.schedule(()=>super.emit(ack),350);return;}
  if(this.mode==='reverse'){super.emit(greeting);super.emit(ack);return;}
  if(this.mode==='greeting-only'){super.emit(greeting);return;}
  if(this.mode==='late-greeting-only'){this.schedule(()=>super.emit(greeting),350);return;}
  if(this.mode==='ack-only'){super.emit(ack);return;}
  if(this.mode==='raw-greeting'){this.streamController.enqueue(greeting);return;}
  if(this.mode==='coalesced'){const a=encode(ack),b=encode(greeting),both=new Uint8Array(a.length+b.length);both.set(a);both.set(b,a.length);this.streamController.enqueue(both);return;}
  if(this.mode==='fragmented'){const both=[...encode(ack),...encode(greeting)];both.forEach((b,i)=>this.schedule(()=>this.streamController.enqueue(Uint8Array.of(b)),i*2));return;}
  if(this.mode==='partial-after-greeting'){super.emit(greeting);this.streamController.enqueue(Uint8Array.of(192,1,6));return;}
  if(this.mode==='disconnect'){this.schedule(()=>this.streamController.close(),20);return;}
  if(this.mode==='cancel'){this.schedule(()=>this.cancelSession(),20);return;}
  super.emit(ack);super.emit(greeting);
 }
 async close(){this.timers.forEach(clearTimeout);this.timers=[];return super.close();}
}
const checks=[];async function run(mode,expected){let c;try{const port=new HandoffPort(mode);selected=port;const policy=await loadOwnerPolicy();c=createController({policy});port.cancelSession=()=>c.cancel();let caught=null;try{await c.connectFromUserGesture({board:owner.target.board,model:owner.target.model});}catch(e){caught=e;}if(expected===true){assert.equal(caught,null,caught?.message);assert.equal(c.snapshot().connected,true);assert.equal(c.snapshot().connection.stage,'ready');assert.equal(c.snapshot().connection.handoff.greeting,true);}else{assert.ok(caught,'failure must be observed');assert.match(caught.message,expected);assert.equal(c.snapshot().connected,false);assert.notEqual(c.snapshot().connection.stage,'ready');}
 assert.equal(port.blocks,0);assert.equal(port.events.filter(e=>e.type==='erase').length,0);assert.equal(port.events.filter(e=>e.type==='command'&&e.op===6).length,1);assert.equal(c.snapshot().security.status,'verified');assert.equal(c.snapshot().connection.build,'paperspace-serial-handoff-1');assert.ok(port.events.some(e=>e.type==='handoff-injection'));checks.push({id:mode,status:'PASS',observedError:caught?.message||null,connection:c.snapshot().connection});}catch(error){checks.push({id:mode,status:'FAIL',error:error.stack});throw error;}finally{await c?.disconnect();}}
try{for(const m of ['normal','reverse','greeting-only','late-greeting-only','coalesced','fragmented'])await run(m,true);for(const [m,p]of [['late-error-ack',/STUB_MEM_END_COMMAND_FAILED/],['error-ack',/STUB_MEM_END_COMMAND_FAILED/],['wrong-op',/STUB_HANDOFF_RESPONSE_FORMAT/],...['1','3','5'].map(n=>['status-length-'+n,/STUB_HANDOFF_RESPONSE_FORMAT/]),['ack-only',/STUB_HANDOFF_TIMEOUT/],['raw-greeting',/Invalid head of packet/],['partial-after-greeting',/No serial data received/],['disconnect',/DEVICE_DISCONNECTED/],['cancel',/CANCELLED/]])await run(m,p);
}finally{const report={checks,engineSha256:sha(engine),runnerSha256:sha(await readFile(new URL(import.meta.url))),modelSha256:sha(await readFile(new URL('security-memory-port.mjs',import.meta.url))),deviceAccess:false,hardware:'NOT_RUN'};await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:checks.filter(c=>c.status==='PASS').length,total:checks.length}));}
