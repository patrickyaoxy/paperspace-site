// Full production command sequence over a device-only protocol model and native Streams.
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
const u32=(b,o=0)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(o,true);
const decode=wire=>{const r=[];for(let i=1;i<wire.length-1;i++)r.push(wire[i]===219?(wire[++i]===220?192:219):wire[i]);return Uint8Array.from(r);};
const OTA=target.images.otaData.address,APP=target.partitions.find(p=>p[1]===0&&p[2]===17)[3];
class DigestPort extends MemoryPort{
 constructor(flash,config){super(flash,{security:{apiVersion:0,purposes:[0,0,0,0,0,0,12],romStatus4:true}});this.config=config;this.faults=[];}
 corrupt(address){this.flash[address]^=1;this.faults.push(address);this.events.push({type:'actual-corruption',address});}
 async receive(wire){const b=decode(wire);if(b.length>=24&&b[1]===19&&u32(b,8)===OTA&&u32(b,12)===8192&&this.events.some(e=>e.type==='flash-data'&&e.address>=OTA)&&this.config.postcommit&&!this.postFault){this.postFault=true;this.corrupt(OTA+4096+100);}return super.receive(wire);}
 reply(op,payload,value){
  if(op===19){const request=this.events.findLast(e=>e.type==='flash-md5');
   if(request.address===APP){
    this.events.push({type:'app-md5-reply',at:performance.now()});
    if(this.config.change==='ota')this.corrupt(OTA+100);
    if(this.config.change==='table')this.corrupt(32768+100);
    if(this.config.delay)return new Promise(resolve=>setTimeout(()=>{super.reply(op,payload,value);resolve();},5400));
   }else if(request.size===8192&&this.config.status&&!this.statusFault){this.statusFault=true;payload=payload.slice();payload[payload.length-1]=193;this.events.push({type:'actual-bad-md5-status'});}
  }return super.reply(op,payload,value);
 }
}
const results=[];
for(const config of [{id:'FULL_APP_AND_OTA_DIGEST',delay:true,success:true},{id:'OTA_CHANGED_NO_COMMIT',change:'ota'},{id:'TABLE_CHANGED_NO_COMMIT',change:'table'},{id:'BAD_READONLY_MD5_STATUS',status:true},{id:'POSTCOMMIT_WHOLE_OTA_MISMATCH',postcommit:true}]){
 if(process.env.CASE_IDS&&!process.env.CASE_IDS.split(',').includes(config.id))continue;
 const before=new Uint8Array(16777216).fill(0x5a);before.fill(255,32768,36864);before.set(files.get(target.images.partitionTable.url),32768);before.fill(255,OTA,OTA+8192);
 const port=selected=new DigestPort(before.slice(),config);let ctl,plan,result,observed,error,snapshot;
 try{
  ctl=createController({policy:await loadOwnerPolicy()});const candidate=await ctl.loadCandidate();await ctl.connectFromUserGesture({board:target.board,model:target.model});plan=await ctl.prepare(candidate,{mode:'auto'});assert.equal(plan.mode,'dual-slot-update');
  const start=port.events.length;try{result=await ctl.execute(plan,ctl.confirm(plan,{installAccepted:true}));}catch(e){observed=e.message;}
  snapshot=ctl.snapshot();assert.equal(snapshot.connection.appMd5Verified,true);assert.equal(snapshot.connection.appMd5.expectedBytes,3338288);assert.equal(snapshot.connection.appMd5.received,snapshot.connection.appMd5.expected);
  const appReply=port.events.findIndex(e=>e.type==='app-md5-reply'),later=port.events.slice(appReply+1);assert.equal(later.filter(e=>e.type==='read-begin').length,0,'no raw READ_FLASH after actual application MD5');
  if(config.success){assert.equal(observed,undefined);assert.equal(result.verified,true);assert.equal(result.otaVerificationMethod,'device-md5-verified-expected-OTA');assert.equal(result.otaRawReadbackPerformed,false);assert.equal(snapshot.connection.otaCommitVerified,true);assert.deepEqual(snapshot.connection.otaVerification.checks.map(c=>[c.address,c.expectedBytes,c.verified]),[[32768,4096,true],[OTA,8192,true],[OTA,8192,true]]);}
  else{assert.ok(observed);assert.notEqual(snapshot.connection.otaCommitVerified,true);if(config.postcommit){assert.equal(snapshot.connection.otaCommitAttempted,true);assert.match(observed,/OTA_COMMIT_DEVICE_MD5_MISMATCH/);}else{assert.notEqual(snapshot.connection.otaCommitAttempted,true);assert.match(observed,config.status?/FLASH_MD5_COMMAND_FAILED/:/precondition changed/);}await assert.rejects(()=>ctl.restart());}
  const writes=port.events.slice(start).filter(e=>e.type==='erase');assert.equal(writes.length,config.success||config.postcommit?2:1);assert.equal(writes[0].address,APP);
  const expected=before.slice();for(const e of writes)expected.set(port.flash.subarray(e.address,e.address+e.size),e.address);for(const address of port.faults)if(!writes.some(e=>address>=e.address&&address<e.address+e.size))expected[address]^=1;assert.deepEqual(port.flash,expected,'only exact plan writes plus explicit device fault; original slot/settings intact');assert.equal(port.wholeChipErases,0);assert.equal(port.events.slice(start).filter(e=>e.type==='reset-signals').length,0);
 }catch(e){error=e.stack;}
 finally{await ctl?.disconnect();assert.equal(port.closed,true);}
 const row={id:config.id,status:error?'FAIL':'PASS',error,observed,result,snapshot};results.push(row);await writeFile(out+'/'+config.id+'.json',JSON.stringify({...row,events:port.events},null,2));console.log(config.id,row.status);
}
await writeFile(out+'/report.json',JSON.stringify({results,engineSha256:sha(await readFile(new URL('real-flash/engine.js',site))),runnerSha256:sha(await readFile(new URL(import.meta.url))),modelSha256:sha(await readFile(new URL('security-memory-port.mjs',import.meta.url))),deviceAccess:false,scope:'bounded developer self-test; not independent QA'},null,2));process.exitCode=results.every(r=>r.status==='PASS')?0:1;
