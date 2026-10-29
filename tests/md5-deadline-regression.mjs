// Bounded developer regression: actual controller/SDK/SLIP parser and native Streams.
// Only the device's MD5 response timing/content is replaced.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MemoryPort} from './security-memory-port.mjs';
const out=process.argv[2];assert.ok(out);await mkdir(out);
const site=new URL('../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const {loadOwnerPolicy,createController}=await import(new URL('real-flash/engine.js',site));
const owner=await readFile(new URL('firmware-target.json',site)),target=JSON.parse(owner).target,files=new Map([['firmware-target.json',owner]]);
for(const item of [target.manifest,...Object.values(target.images)]){const bytes=await readFile(new URL(item.url,site));assert.equal(sha(bytes),item.sha256);files.set(item.url,bytes);}
let selected;globalThis.isSecureContext=true;
Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>selected}});
Object.defineProperty(navigator,'userActivation',{configurable:true,value:{isActive:true}});
globalThis.fetch=async url=>{const key=[...files.keys()].find(k=>String(url).endsWith('/'+k));assert.ok(key);return new Response(files.get(key));};
const encode=b=>{const a=[192];for(const v of b)a.push(...v===192?[219,220]:v===219?[219,221]:[v]);a.push(192);return Uint8Array.from(a);};
class MD5Port extends MemoryPort{
 constructor(flash,config){super(flash,{security:{apiVersion:0,purposes:[0,0,0,0,0,0,12],romStatus4:true}});this.config=config;this.timers=new Set();}
 later(fn,ms){const t=setTimeout(()=>{this.timers.delete(t);if(!this.closed)fn();},ms);this.timers.add(t);}
 reply(op,payload,value){
  if(op!==19||this.md5Injected)return super.reply(op,payload,value);
  this.md5Injected=true;this.injectedAt=performance.now();const b=new Uint8Array(8+payload.length);b[0]=1;b[1]=op;new DataView(b.buffer).setUint16(2,payload.length,true);b.set(payload,8);
  if(this.config.status)b[b.length-1]=193;if(this.config.mismatch)b[8]^=1;
  const wire=encode(b);this.events.push({type:'md5-injection',config:this.config});
  const emit=bytes=>{this.events.push({type:'actual-md5-fragment',bytes:bytes.length,elapsedMs:performance.now()-this.injectedAt});this.streamController.enqueue(bytes);};
  this.later(()=>emit(wire.slice(0,-1)),this.config.delay??0);
  this.later(()=>emit(wire.slice(-1)),this.config.tail??((this.config.delay??0)+30));
  if(this.config.cancel)this.later(()=>this.cancel(),100);
 }
 async close(){this.timers.forEach(clearTimeout);this.timers.clear();return super.close();}
}
const cases=[{id:'DELAYED_6200MS_FRAGMENT',delay:6200,success:true},{id:'BAD_SECOND_STATUS',status:true,error:/FLASH_MD5_COMMAND_FAILED/},{id:'MD5_MISMATCH',mismatch:true,error:/MD5 mismatch/},{id:'CANCEL_DURING_MD5',delay:6200,cancel:true,error:/CANCEL/},{id:'PARTIAL_TAIL_OVER_DEADLINE',tail:28000,error:/FLASH_MD5_DEADLINE_EXCEEDED/}];
const results=[];
for(const config of cases){
 if(process.env.CASE_IDS&&!process.env.CASE_IDS.split(',').includes(config.id))continue;
 const before=new Uint8Array(16777216).fill(0x5a),table=target.images.partitionTable,ota=target.images.otaData;
 before.fill(255,table.address,table.address+4096);before.set(files.get(table.url),table.address);before.fill(255,ota.address,ota.address+8192);
 const port=selected=new MD5Port(before.slice(),config);let ctl,plan,result,error,observed,snapshot;
 try{
  ctl=createController({policy:await loadOwnerPolicy()});port.cancel=()=>ctl.cancel('CANCEL_DURING_MD5');const candidate=await ctl.loadCandidate();await ctl.connectFromUserGesture({board:target.board,model:target.model});plan=await ctl.prepare(candidate,{mode:'auto'});
  assert.equal(plan.mode,'dual-slot-update');assert.equal(target.images.app.bytes,3338288);
  const start=port.events.length;
  try{result=await ctl.execute(plan,ctl.confirm(plan,{installAccepted:true}));}catch(e){observed=e.message;}
  snapshot=ctl.snapshot();const events=port.events.slice(start),appMD5=snapshot.connection.appMd5??snapshot.connection.md5;
  assert.equal(appMD5.expectedBytes,3338288);assert.equal(appMD5.budgetMs,26706.304);
  if(config.success){assert.equal(observed,undefined);assert.equal(result.md5Verified,true);assert.equal(result.otaCommitPerformed,true);assert.ok(appMD5.elapsedMs>=6200);assert.ok(appMD5.elapsedMs<appMD5.budgetMs);assert.equal(appMD5.received,appMD5.expected);}
  else{assert.match(observed,config.error);assert.notEqual(snapshot.connection.appMd5Verified,true);assert.notEqual(snapshot.connection.otaCommitAttempted,true);assert.deepEqual(port.flash.subarray(ota.address,ota.address+8192),before.subarray(ota.address,ota.address+8192));await assert.rejects(()=>ctl.restart());}
  assert.equal(events.filter(e=>e.type==='reset-signals').length,0);assert.equal(port.wholeChipErases,0);
  const erases=events.filter(e=>e.type==='erase');assert.equal(erases.length,config.success?2:1);assert.equal(erases[0].address,plan.address);
  const expected=before.slice();for(const e of erases)expected.set(port.flash.subarray(e.address,e.address+e.size),e.address);assert.deepEqual(port.flash,expected,'original slot, bootloader, table and settings unchanged');
 }catch(e){error=e.stack;}
 finally{await ctl?.disconnect();assert.equal(port.closed,true);}
 const row={id:config.id,status:error?'FAIL':'PASS',error,observed,snapshot,result};results.push(row);await writeFile(out+'/'+config.id+'.json',JSON.stringify({...row,events:port.events},null,2));console.log(config.id,row.status);
}
await writeFile(out+'/report.json',JSON.stringify({results,engineSha256:sha(await readFile(new URL('real-flash/engine.js',site))),runnerSha256:sha(await readFile(new URL(import.meta.url))),modelSha256:sha(await readFile(new URL('security-memory-port.mjs',import.meta.url))),deviceAccess:false,scope:'bounded developer self-test; not independent QA'},null,2));
process.exitCode=results.every(r=>r.status==='PASS')?0:1;
