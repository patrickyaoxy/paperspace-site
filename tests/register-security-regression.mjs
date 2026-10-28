// Actual production controller over a device-side serial model. No real devices.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {MemoryPort} from './security-memory-port.mjs';
import {verifiedLoader} from '../scripts/engine-adaptation/maintenance-methods.mjs';
const site=new URL('../',import.meta.url),out=process.argv[2];assert.ok(out,'Pass new report directory');await mkdir(out);
const sha=b=>createHash('sha256').update(b).digest('hex'),engine=await readFile(new URL('real-flash/engine.js',site));
const {loadOwnerPolicy,createController}=await import(new URL('real-flash/engine.js',site));
const ownerBytes=await readFile(new URL('firmware-target.json',site)),owner=JSON.parse(ownerBytes),target=owner.target,files=new Map([['firmware-target.json',ownerBytes]]);
for(const item of [target.manifest,...Object.values(target.images)]){const b=await readFile(new URL(item.url,site));assert.equal(sha(b),item.sha256);files.set(item.url,b);}
let selected;globalThis.isSecureContext=true;Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>selected}});Object.defineProperty(navigator,'userActivation',{configurable:true,value:{isActive:true}});globalThis.fetch=async url=>{const key=[...files.keys()].find(k=>String(url).endsWith('/'+k));assert.ok(key);return new Response(files.get(key));};
const checks=[];
async function run(id,fn){try{await fn();checks.push({id,status:'PASS'});}catch(error){checks.push({id,status:'FAIL',error:error.stack});throw error;}}
class FaultPort extends MemoryPort{
 constructor(options={}){super(new Uint8Array(16777216).fill(255));this.options=options;this.inject=false;this.registers.set(0x60007044,0);this.registers.set(0x60007048,0x0201);}
 async receive(wire){ // Decode just the command address, leaving model validation/response intact.
 const raw=[];for(let i=1;i<wire.length-1;i++){if(wire[i]===219){raw.push(wire[++i]===220?192:219);}else raw.push(wire[i]);}
 const b=Uint8Array.from(raw);this.address=b[1]===10?new DataView(b.buffer).getUint32(8,true):null;
 return super.receive(wire);
 }
 reply(op,payload,value){const o=this.options;if(op===10&&this.inject&&this.address===o.address){this.events.push({type:'actual-register-injection',address:this.address,stub:this.stubStarted,value:o.value??0,status:o.status??[1,193]});return super.reply(op,Uint8Array.from(o.status??[1,193]),o.value??0);}return super.reply(op,payload,value);}
}
async function environment(port){selected=port;const policy=await loadOwnerPolicy(),c=createController({policy});const candidate=await c.loadCandidate();return{c,candidate};}
const low=0x60007044,high=0x60007048,revision=0x60007058,rdid=0x60002058;
try{
 // Isolated contract edge cases complement serial integration (which normalizes uint32 to signed32).
 const Base=class{DEFAULT_TIMEOUT=123;ESP_READ_REG=10;debug(){}toHex(x){return String(x)}_intToByteArray(x){return new Uint8Array(4)}async command(...args){this.args=args;return this.reply}};
 const Loader=vm.runInNewContext(verifiedLoader+';VerifiedESPLoader',{vt:Base,Uint8Array});
 for(const value of [-2147483648,-1,0,2147483647,4294967295])await run('SIGNED_UINT32_'+value,async()=>{const l=new Loader;l.reply=[value,Uint8Array.of(0,0)];assert.equal(await l.readReg(1),value);assert.equal(l.args[4],123);});
 for(const [id,reply]of [['STATUS4_OK',[0,new Uint8Array(4)]],['STATUS_ERR',[0,Uint8Array.of(1,193)]],['STATUS_SHORT',[0,new Uint8Array(1)]],['STATUS3',[0,new Uint8Array(3)]],['STATUS5',[0,new Uint8Array(5)]],['STATUS_ARRAY',[0,[0,0]]],['TUPLE_EXTRA',[0,new Uint8Array(2),0]],['TUPLE_OBJECT',{0:0,1:new Uint8Array(2),length:2}],['FRACTION',[0.5,new Uint8Array(2)]],['LOW_RANGE',[-2147483649,new Uint8Array(2)]],['HIGH_RANGE',[4294967296,new Uint8Array(2)]],['NAN',[NaN,new Uint8Array(2)]],['INFINITY',[Infinity,new Uint8Array(2)]]])await run('ADAPTER_'+id,async()=>{const l=new Loader;l.reply=reply;if(id==='STATUS4_OK')assert.equal(await l.readReg(1,456),0);else await assert.rejects(()=>l.readReg(1),/READ_REG_/);});
 for(const[address,label]of [[low,'MAC_LOW_ZERO_HIGH_NONZERO'],[high,'MAC_HIGH'],[revision,'REVISION'],[0x60007050,'REVISION_AUX'],[rdid,'RDID']])await run('CONNECT_ERROR_STATUS_'+label,async()=>{const port=new FaultPort({address}),{c}=await environment(port);port.inject=true;try{await assert.rejects(()=>c.connectFromUserGesture({board:target.board,model:target.model}),/READ_REG_COMMAND_FAILED/);assert.ok(port.events.some(e=>e.type==='actual-register-injection'));assert.equal(port.blocks,0);assert.equal(port.events.filter(e=>e.type==='erase').length,0);}finally{await c.disconnect();}await writeFile(out+'/'+label+'.events.json',JSON.stringify(port.events));});
 await run('ROM_STUB_PREWRITE_SAME_PERSISTENT_BAD_MAC',async()=>{const port=new FaultPort({address:low}),{c,candidate}=await environment(port);try{await c.connectFromUserGesture({board:target.board,model:target.model});const p=await c.prepare(candidate);const confirmation=c.confirm(p,{installAccepted:true});port.inject=true;await assert.rejects(()=>c.execute(p,confirmation),/READ_REG_COMMAND_FAILED/);assert.ok(port.events.some(e=>e.type==='actual-register-injection'&&e.stub));assert.equal(port.blocks,0);assert.equal(port.events.filter(e=>e.type==='erase').length,0);const stub=port.events.findIndex(e=>e.type==='stub-start');assert.ok(port.events.slice(0,stub).some(e=>e.type==='security-info'));assert.equal(port.events.slice(stub+1).filter(e=>e.type==='command'&&e.op===20).length,0);assert.ok(port.events.slice(stub+1).filter(e=>e.type==='read-register'&&[0x60007034,0x60007038,0x6000703c].includes(e.address)).length>=3);}finally{await c.disconnect();}await writeFile(out+'/prewrite.events.json',JSON.stringify(port.events));});
}finally{await writeFile(out+'/report.json',JSON.stringify({checks,engineSha256:sha(engine),modelSha256:sha(await readFile(new URL('security-memory-port.mjs',import.meta.url))),runnerSha256:sha(await readFile(new URL(import.meta.url))),deviceAccess:false,hardware:'NOT_RUN'},null,2)+'\n');console.log(JSON.stringify({passed:checks.filter(x=>x.status==='PASS').length,total:checks.length}));}
