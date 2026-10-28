// Device-side ESP serial protocol model. No host policy/planning/WL/FAT logic.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const u32=(b,p=0)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(p,true);
const put=(b,p,x)=>new DataView(b.buffer,b.byteOffset,b.byteLength).setUint32(p,x>>>0,true);
const md5=b=>new Uint8Array(createHash('md5').update(b).digest());
const xor=b=>b.reduce((x,y)=>x^y,0xef);
function encode(b){const a=[0xc0];for(const x of b)a.push(...x===0xc0?[0xdb,0xdc]:x===0xdb?[0xdb,0xdd]:[x]);a.push(0xc0);return Uint8Array.from(a);}
function decode(b){assert.equal(b[0],0xc0);assert.equal(b.at(-1),0xc0);const a=[];for(let i=1;i<b.length-1;i++){if(b[i]===0xdb){const x=b[++i];assert.ok(x===0xdc||x===0xdd);a.push(x===0xdc?0xc0:0xdb);}else{assert.notEqual(b[i],0xc0);a.push(b[i]);}}return Uint8Array.from(a);}
export class MemoryPort {
  constructor(flash,{fault={},security={}}={}){
    assert.equal(flash.length,0x1000000);this.flash=flash;this.fault=fault;this.events=[];this.readable=null;this.writable=null;this.closed=true;this.blocks=0;this.ramBlocks=0;this.readAcks=0;this.wholeChipErases=0;
    this.registers=new Map([[1610641476,0x03040506],[1610641480,0x0201]]);this.security={flags:0,apiVersion:1,cryptCnt:0,purposes:[0,0,0,0,0,0,0],...security};this.stubStarted=false;this.securityReads=0;this.rx=null;this.writeRegion=null;this.ramRegion=null;this.streamController=null;this.readerCancelled=false;
    const q=this.security,k=q.regPurposes||q.purposes.slice(0,6),flags=q.flags;
    this.registers.set(0x60007034,(((q.regCryptCnt??q.cryptCnt)<<18)|(k[0]<<24)|(k[1]<<28))>>>0);
    this.registers.set(0x60007038,((q.regSecureBoot??!!(flags&1))<<20)|k[2]|(k[3]<<4)|(k[4]<<8)|(k[5]<<12));
    this.registers.set(0x6000703c,(((q.secureVersionBits||0)<<14)|((q.regSecureDownload??!!(flags&4))<<5))>>>0);
  }
  getInfo(){return {usbVendorId:0x10c4,usbProductId:0xea60};}
  async open(options){assert.ok(this.closed);this.closed=false;this.readerCancelled=false;this.events.push({type:'open',baudRate:options.baudRate});this.readable=new ReadableStream({start:c=>this.streamController=c,cancel:()=>{this.readerCancelled=true;}});this.writable=new WritableStream({write:bytes=>this.receive(bytes)});}
  async close(){if(!this.closed){this.closed=true;if(!this.readerCancelled)this.streamController.close();}this.readable=null;this.writable=null;this.events.push({type:'close'});}
  async setSignals(signals){assert.ok(!this.closed);this.events.push({type:'reset-signals',...signals});}
  emit(bytes){assert.ok(!this.closed);this.streamController.enqueue(encode(bytes));}
  reply(op,payload=new Uint8Array(2),value=0){const b=new Uint8Array(8+payload.length);b[0]=1;b[1]=op;new DataView(b.buffer).setUint16(2,payload.length,true);put(b,4,value);b.set(payload,8);this.emit(b);}
  error(op,reason){this.events.push({type:'injected-or-device-error',op,reason});this.reply(op,Uint8Array.of(1,0xc1));}
  range(start,size){assert.ok(Number.isInteger(start)&&Number.isInteger(size)&&start>=0&&size>0&&start+size<=this.flash.length,'model flash bounds');}
  readChunk(){const r=this.rx;const end=Math.min(r.size,r.sent+1024);const b=this.flash.slice(r.start+r.sent,r.start+end);if(this.fault.corruptReadback && this.blocks>0 && r.start===this.fault.corruptReadback && r.sent===0){b[0]^=1;this.events.push({type:'injection',kind:'corrupt-readback',address:r.start});}r.sent=end;this.emit(b);}
  async receive(wire){
    assert.ok(!this.closed);const b=decode(wire);
    if(b.length===4){assert.ok(this.rx);const n=u32(b);assert.equal(n,this.rx.sent);this.readAcks++;if(n<this.rx.size)this.readChunk();else{this.emit(md5(this.flash.subarray(this.rx.start,this.rx.start+this.rx.size)));this.events.push({type:'read-complete',address:this.rx.start,size:this.rx.size});this.rx=null;}return;}
    assert.ok(b.length>=8&&b[0]===0);assert.equal(new DataView(b.buffer).getUint16(2,true),b.length-8);const op=b[1],p=b.subarray(8);this.events.push({type:'command',op,size:p.length});
    if(op===8){assert.equal(p.length,36);assert.deepEqual(Array.from(p.subarray(0,4)),[7,7,18,32]);assert.ok(p.subarray(4).every(x=>x===0x55));for(let i=0;i<8;i++)this.reply(op,new Uint8Array(2),1);return;}
    if(op===20){assert.equal(p.length,0);this.securityReads++;const q=this.security;if(this.stubStarted&&q.stubRejectSecurityInfo!==false){this.events.push({type:'unsupported-stub-security-command'});this.reply(op,Uint8Array.of(1,5));return;}if(q.infoErrorsAt?.includes(this.securityReads)){this.reply(op,Uint8Array.of(1,0xc1));return;}const short=q.shortAt?.includes(this.securityReads),data=new Uint8Array(short?14:22);put(data,0,q.flags);data[4]=q.cryptCnt;data.set(q.purposes,5);if(!short){put(data,12,q.chipId??9);put(data,16,q.apiVersion);}this.events.push({type:'security-info',request:this.securityReads,bytes:short?12:20,flags:q.flags,apiVersion:q.apiVersion});this.reply(op,data);return;}
    if(op===10){assert.equal(p.length,4);const address=u32(p);if(this.security.errorRegister===address){this.events.push({type:'security-register-error',address,value:0,status:[1,193]});this.reply(op,Uint8Array.of(1,193),0);return;}if(this.security.shortStatusRegister===address){this.reply(op,Uint8Array.of(0),0);return;}this.events.push({type:'read-register',address,value:this.registers.get(address)||0});this.reply(op,new Uint8Array(this.security.romStatus4?4:2),this.registers.get(address)||0);return;}
    if(op===9){assert.equal(p.length,16);const addr=u32(p),value=u32(p,4),mask=u32(p,8);this.registers.set(addr,((this.registers.get(addr)||0)&~mask|value&mask)>>>0);if(addr===1610620928&&value===1<<18){assert.equal(this.registers.get(1610620960),0x7000009f);this.registers.set(addr,0);this.registers.set(1610621016,0x1840ba);}this.reply(op);return;}
    if(op===5){assert.equal(p.length,16);this.ramRegion={bytes:u32(p),blocks:u32(p,4),blockSize:u32(p,8),address:u32(p,12),seq:0,written:0};this.events.push({type:'ram-begin',...this.ramRegion});this.reply(op);return;}
    if(op===7){const r=this.ramRegion;assert.ok(r);assert.equal(u32(p),p.length-16);assert.equal(u32(p,4),r.seq);assert.equal(u32(p,8),0);assert.equal(u32(p,12),0);assert.equal(u32(b,4),xor(p.subarray(16)));r.seq++;r.written+=p.length-16;this.ramBlocks++;this.reply(op);return;}
    if(op===6){assert.equal(p.length,8);assert.equal(u32(p),0);assert.ok(this.ramRegion.written===this.ramRegion.bytes);this.stubStarted=true;this.events.push({type:'stub-start',entry:u32(p,4)});this.reply(op);this.emit(new TextEncoder().encode('OHAI'));return;}
    if(op===13){assert.equal(p.length,4);assert.equal(u32(p),0);this.reply(op);return;}
    if(op===210){assert.equal(p.length,16);const address=u32(p),size=u32(p,4);this.range(address,size);assert.equal(u32(p,8),4096);assert.equal(u32(p,12),1024);assert.equal(this.rx,null);this.rx={start:address,size,sent:0};this.events.push({type:'read-begin',address,size});this.reply(op);this.readChunk();return;}
    if(op===2){assert.equal(p.length,16);const size=u32(p),blocks=u32(p,4),blockSize=u32(p,8),address=u32(p,12);this.range(address,size);assert.equal(address%4096,0);assert.equal(size%4096,0);assert.equal(blocks*blockSize,size);assert.ok([2048,4096,16384].includes(blockSize));this.flash.fill(255,address,address+size);this.writeRegion={address,size,blocks,blockSize,seq:0,last:null};this.events.push({type:'erase',address,size});this.reply(op);return;}
    if(op===3){const r=this.writeRegion;assert.ok(r);const seq=u32(p,4),bytes=p.subarray(16);assert.equal(u32(p),r.blockSize);assert.equal(bytes.length,r.blockSize);assert.equal(u32(p,8),0);assert.equal(u32(p,12),0);assert.equal(xor(bytes),u32(b,4));if(this.fault.failAfterBlocks!==undefined&&this.blocks>=this.fault.failAfterBlocks){this.error(op,'explicit FLASH_DATA error after acknowledged blocks');return;}assert.ok(seq===r.seq||seq===r.seq-1,'model sequence');if(seq===r.seq){this.flash.set(bytes,r.address+seq*r.blockSize);r.seq++;r.last=bytes;this.blocks++;this.events.push({type:'flash-data',address:r.address+seq*r.blockSize,size:bytes.length,seq});}else assert.deepEqual(bytes,r.last);this.reply(op);return;}
    if(op===4){assert.equal(p.length,4);assert.equal(u32(p),1);assert.equal(this.writeRegion.seq,this.writeRegion.blocks);this.events.push({type:'flash-finish',address:this.writeRegion.address});this.reply(op);return;}
    if(op===19){assert.equal(p.length,16);const address=u32(p),size=u32(p,4);this.range(address,size);assert.equal(u32(p,8),0);assert.equal(u32(p,12),0);const data=new Uint8Array(18);data.set(md5(this.flash.subarray(address,address+size)));this.events.push({type:'flash-md5',address,size});this.reply(op,data);return;}
    if(op===208)this.wholeChipErases++;
    throw Error('Unmodelled/forbidden opcode 0x'+op.toString(16));
  }
}
