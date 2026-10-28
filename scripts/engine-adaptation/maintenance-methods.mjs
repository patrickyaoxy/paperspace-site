export const verifiedReadLoop = "async function(){for(var t;this.device.readable;){this.reader=(t=this.device.readable)===null||t===void 0?void 0:t.getReader();try{let{value:A,done:i}=await this.reader.read();if(i){this.trace(\"Serial port done\");break}if(A&&A.length){let s=Uint8Array.from(A);this.buffer=this.appendArray(this.buffer,s)}}catch(A){if(this.onSerialReadError?.(A)===true)break;if(A instanceof Error){if([\"BufferOverrunError\",\"FramingError\",\"BreakError\",\"ParityError\"].includes(A.name)){this.trace(`Recoverable serial port error: ${A.message}`);continue}this.trace(`Unrecoverable serial port error: ${A.message}`);break}if(A instanceof DOMException){this.onDeviceLostCallback?this.onDeviceLostCallback():this.trace(`Unrecoverable serial port error: ${A.message}`);break}this.trace(`Unrecoverable serial port error: ${A}`);break}finally{this.reader.releaseLock()}}this.trace(\"readLoop exited\")}";
const stubReadFlashMethod = "async readFlash(t,A,i=null){const d=this.connection.read={readStart:t,readExpected:A,readReceived:0,acknowledgedReadBytes:0,currentStep:\"command-ack\",dataFrames:0,md5Verified:false};let s=this._appendArray(this._intToByteArray(t),this._intToByteArray(A));s=this._appendArray(s,this._intToByteArray(4096)),s=this._appendArray(s,this._intToByteArray(1024));let reply=await this.command(this.ESP_READ_FLASH,s);if(!Array.isArray(reply)||reply.length!==2||!(reply[1] instanceof Uint8Array)||reply[1].length!==2)throw new Error(\"READ_FLASH_RESPONSE_FORMAT\");if(reply[0]!==0||!reply[1].every(v=>v===0))throw new Error(\"READ_FLASH_COMMAND_FAILED: status=\"+Array.from(reply[1]).join(\",\"));d.currentStep=\"data\";let a=new Uint8Array(0);for(;a.length<A;){let r=await this.transport.read(this.FLASH_READ_TIMEOUT);if(r instanceof Uint8Array)r.length>0&&(a=this._appendArray(a,r),d.readReceived=a.length,d.dataFrames++,await this.transport.write(this._intToByteArray(a.length)),d.acknowledgedReadBytes=a.length,i&&i(r,a.length,A));else throw new u(\"Failed to read memory: \"+r)}d.currentStep=\"trailing-md5\";return a}";
const stubRunMethod = "async runStub(){if(this.syncStubDetected)return this.info(\"Stub is already running. No upload is necessary.\"),this.IS_STUB=!0,await this.applyUsbFlashWriteSize(),this.chip;if(this.secureDownloadMode)return this.info(\"Stub flasher is not supported in Secure Download Mode, it has been disabled.\"),this.chip;let t=this.chip.getChipRevision?await this.chip.getChipRevision(this):void 0,A=await rt(this.chip.CHIP_NAME,t);if(A===void 0)return this.info(`Stub flasher is not yet supported on ${this.chip.CHIP_NAME}, it has been disabled.`),this.chip;this.info(\"Uploading stub...\");let i=[A.decodedText,A.decodedData];for(let a=0;a<i.length;a++)if(i[a]){let r=a===0?A.text_start:A.data_start,h=i[a].length,o=Math.floor((h+this.ESP_RAM_BLOCK-1)/this.ESP_RAM_BLOCK);await this.memBegin(h,o,this.ESP_RAM_BLOCK,r);for(let g=0;g<o;g++){let R=g*this.ESP_RAM_BLOCK,_=R+this.ESP_RAM_BLOCK;await this.memBlock(i[a].slice(R,_),g)}}this.info(\"Running stub...\"),await this.startVerifiedStub(A.entry);return this.info(\"Stub running...\"),this.IS_STUB=!0,await this.applyUsbFlashWriteSize(),this.chip}";
export const verifiedLoader = String.raw`class VerifiedESPLoader extends vt {
 async readReg(address,timeout=this.DEFAULT_TIMEOUT){
  this.debug("Read Register:"+this.toHex(address));
  const reply=await this.command(this.ESP_READ_REG,this._intToByteArray(address),void 0,void 0,timeout);
  if(!Array.isArray(reply)||reply.length!==2||!(reply[1] instanceof Uint8Array)||![2,4].includes(reply[1].length))throw new Error("READ_REG_RESPONSE_FORMAT");
  if(!reply[1].every(value=>value===0))throw new Error("READ_REG_COMMAND_FAILED: address="+address+" status="+Array.from(reply[1]).join(","));
  const value=reply[0];
  if(!Number.isSafeInteger(value)||value< -2147483648||value>4294967295)throw new Error("READ_REG_VALUE_INVALID");
  this.debug("Read Register Value:"+value);return value;
 }

 connection={build:"paperspace-serial-read-2",stage:"new",lastOpcode:null,commands:0,events:[],handoff:null};
 setConnectionStage(stage){this.connection.stage=stage;if(this.connection.events.length<32)this.connection.events.push(stage);}
 async command(...args){if(args[0]!=null){this.connection.lastOpcode=args[0];this.connection.commands++;}return super.command(...args);}
 async startVerifiedStub(entry){
  this.setConnectionStage("stub-handoff");
  const state={memEndSent:false,ack:false,greeting:false,frames:0,optionalAckTimedOut:false};this.connection.handoff=state;
  const stop=(code,detail)=>{const error=new Error(code+(detail?": "+detail:""));error.code=code;throw error;};
  const data=this._appendArray(this._intToByteArray(entry===0?1:0),this._intToByteArray(entry));
  await this.command(this.ESP_MEM_END,data,0,false);state.memEndSent=true;
  const deadline=Date.now()+this.DEFAULT_TIMEOUT;
  for(let count=0;count<8;count++){
   const remaining=deadline-Date.now();if(remaining<=0)stop("STUB_HANDOFF_TIMEOUT","OHAI greeting not verified");
   let packet;
   try{packet=await this.transport.read(remaining);}
   catch(error){
    // Only a completely empty optional ROM ACK window may be absent after a verified SLIP OHAI.
    // Partial frames, invalid SLIP, disconnects, cancellations and explicit command errors still fail.
    if(state.greeting&&!state.ack&&error.message==="Serial data stream stopped: Possible serial noise or corruption."){state.optionalAckTimedOut=true;break;}
    if(!state.greeting&&/Serial data stream stopped|No serial data received/.test(error.message))stop("STUB_HANDOFF_TIMEOUT",error.message);
    throw error;
   }
   state.frames++;
   if(packet instanceof Uint8Array&&packet.length===4&&packet[0]===79&&packet[1]===72&&packet[2]===65&&packet[3]===73){
    if(state.greeting)stop("STUB_HANDOFF_UNEXPECTED_FRAME","Duplicate OHAI");state.greeting=true;
   }else{
    if(!(packet instanceof Uint8Array)||![10,12].includes(packet.length)||packet[0]!==1||packet[1]!==this.ESP_MEM_END||(packet[2]|packet[3]<<8)!==packet.length-8)stop("STUB_HANDOFF_RESPONSE_FORMAT","Expected MEM_END response or SLIP OHAI");
    if(!packet.subarray(8).every(value=>value===0))stop("STUB_MEM_END_COMMAND_FAILED","status="+Array.from(packet.subarray(8)).join(","));
    if(state.ack)stop("STUB_HANDOFF_UNEXPECTED_FRAME","Duplicate MEM_END response");state.ack=true;
   }
   if(state.greeting&&state.ack)break;
  }
  if(!state.greeting)stop("STUB_HANDOFF_TIMEOUT","OHAI greeting not verified");
  this.setConnectionStage("stub-ready");
 }

${stubRunMethod}
${stubReadFlashMethod}

}`;
export const securityMethod = String.raw`async #H(){
 const rom=this.#e==="connecting",previous=this.#security;
 const d={stage:rom?"rom-security":"prewrite-security",status:"reading",attempts:[],romVerified:false,romInfo:null,efuse:null};this.#security=d;
 const stop=(code,detail)=>{d.status="blocked";d.code=code;if(detail)d.detail=detail;const error=new Error(code+": "+JSON.stringify(d));error.code=code;throw error;};
 const word=v=>Number.isSafeInteger(v)&&v>=-2147483648&&v<=4294967295;
 const pop=v=>{let n=0;for(;v;v&=v-1)n++;return n;};
 let info;
 if(rom){
  this.#t.securityInfoCache=null;
  for(let attempt=1;attempt<=2;attempt++){
   this.#i();d.attempts.push({command:"GET_SECURITY_INFO",attempt});
   try{info=await this.#t.getSecurityInfo(false);break;}catch(error){
    this.#i();d.attempts.at(-1).error=String(error.message||error);
    if(attempt===2)stop("SECURITY_READ_FAILED","ROM GET_SECURITY_INFO failed twice");
    this.#s++;this.#Y=new WeakMap;this.#u=new WeakMap;this.#t.securityInfoCache=null;
   }
  }
  d.romInfo=info?{chipId:info.chipId??null,flags:info.flags??null,flashCryptCnt:info.flashCryptCnt??null,apiVersion:info.apiVersion??null,keyPurposes:info.keyPurposes??null}:null;
  if(!info||info.chipId!==9||!Number.isInteger(info.flags)||info.flags<0||info.flags>4294967295||!Number.isInteger(info.apiVersion)||info.apiVersion<0||info.apiVersion>4294967295||!Number.isInteger(info.flashCryptCnt)||info.flashCryptCnt<0||info.flashCryptCnt>7||!Array.isArray(info.keyPurposes)||info.keyPurposes.length!==7)stop("SECURITY_INFO_FORMAT_UNSUPPORTED","ESP32-S3 20-byte SDK layout required; legacy fallback is not proof");
  if((info.flags&~0x7ff)!==0)stop("SECURITY_UNKNOWN_FLAGS");
  if(!info.keyPurposes.slice(0,6).every(v=>Number.isInteger(v)&&v>=0&&v<=15))stop("SECURITY_INFO_FORMAT_UNSUPPORTED","Six S3 hardware key purpose nibbles required");
  // esptool-js exposes seven wire bytes; ESP32-S3 has only six hardware key blocks.
  // The trailing byte is retained in diagnostics, never interpreted as a protection.
  if(info.flags&1)stop("SECURE_BOOT_ENABLED");
  if(info.flags&4)stop("SECURE_DOWNLOAD_ENABLED");
  if(pop(info.flashCryptCnt)&1)stop("FLASH_ENCRYPTION_ENABLED");
 }else{
  if(previous?.romVerified!==true||!previous.romInfo)stop("SECURITY_ROM_PROOF_MISSING");
  info=structuredClone(previous.romInfo);d.romInfo=info;
 }
 const read=async(address,name)=>{
  const limit=rom?2:1;
  for(let attempt=1;attempt<=limit;attempt++){
   this.#i();const entry={command:"READ_REG",field:name,address,attempt};d.attempts.push(entry);
   let value;try{const data=new Uint8Array(4);new DataView(data.buffer).setUint32(0,address,true);const reply=await this.#t.command(10,data,0,true);if(!Array.isArray(reply)||reply.length!==2||!(reply[1] instanceof Uint8Array)||![2,4].includes(reply[1].length))stop("SECURITY_EFUSE_RESPONSE_FORMAT",name);entry.status=Array.from(reply[1]);if(!reply[1].every(v=>v===0))throw new Error("SECURITY_EFUSE_COMMAND_FAILED: "+name+" status="+entry.status.join(","));value=reply[0];}catch(error){this.#i();if(error.code)throw error;entry.error=String(error.message||error);if(attempt===limit)stop("SECURITY_EFUSE_READ_FAILED",name);this.#s++;this.#Y=new WeakMap;this.#u=new WeakMap;continue;}
   if(!word(value))stop("SECURITY_EFUSE_FORMAT_UNSUPPORTED",name);return value>>>0;
  }
 };
 const a=await read(0x60007034,"repeat-data1"),b=await read(0x60007038,"repeat-data2"),c=await read(0x6000703c,"repeat-data3");
 const crypt=(a>>>18)&7,secureBoot=!!((b>>>20)&1),secureDownload=!!((c>>>5)&1),versionBits=(c>>>14)&0xffff;
 const purposes=[(a>>>24)&15,(a>>>28)&15,b&15,(b>>>4)&15,(b>>>8)&15,(b>>>12)&15];
 d.efuse={flashCryptCnt:crypt,flashEncryptionEnabled:!!(pop(crypt)&1),secureBootEnabled:secureBoot,secureDownloadEnabled:secureDownload,secureVersionBurnedBits:versionBits,secureVersion:pop(versionBits),hardwareKeyPurposes:purposes};
 if(secureBoot)stop("SECURE_BOOT_ENABLED");if(secureDownload)stop("SECURE_DOWNLOAD_ENABLED");if(pop(crypt)&1)stop("FLASH_ENCRYPTION_ENABLED");
 if(versionBits!==0)stop("ANTI_ROLLBACK_SECURE_VERSION_UNSUPPORTED","Burned secure version exceeds target secure_version=0; this does not prove hardware antiRollback enforcement");
 if(crypt!==info.flashCryptCnt||secureBoot!==!!(info.flags&1)||secureDownload!==!!(info.flags&4)||purposes.some((v,i)=>v!==info.keyPurposes[i]))stop("SECURITY_EFUSE_MISMATCH","ROM information and read-only eFuse fields disagree");
 d.romVerified=true;d.status="verified";d.code="SECURITY_UNPROTECTED_COMPATIBLE";return d;
}`;
export const confirmMethod = String.raw`confirm(t,{installAccepted:A,destructiveAccepted,backupSha256:i,backupSaved:s}={}){
 f(!this.#f,"BUSY");this.#i();let n=this.#y(t);f(t.executable,t.blockedReason||"PLAN_NOT_EXECUTABLE");
 f(A===true,"Explicit current-plan installation acceptance required");
 if(t.destructive)f(destructiveAccepted===true,"Explicit current-plan destructive reinstall acceptance required");
 if(t.backupRequired)f(n.backup&&s===true&&i===n.backup.sha256,"Current full migration backup must be saved and acknowledged");
 let a=V({planId:t.id,backupSha256:t.backupRequired?i:null,impactAcknowledged:true,destructiveAccepted:t.destructive===true});
 this.#u.set(a,{plan:t,generation:this.#s,backup:t.backupRequired?n.backup:null});return a;
}`;
export const prewriteMethod = String.raw`async #m(t,onProgress=()=>{}){
 await this.#H();f(await this.#k()===this.#A.flashId&&await this.#t.chip.readMac(this.#t)===this.#A.mac,"Device identity changed");
 for(let A of [...t.conditions,...t.backupConditions])f(await b(await this.#w(A.address,A.size))===A.sha256,"Device precondition changed before write");
 if(!t.cleanReinstall&&this.#A.layout==="blank")for(let address=0;address<iA;address+=65536){this.#i();f(fA(await this.#o(address,Math.min(65536,iA-address))),"BLANK_FLASH_NOT_EMPTY: full read-only scan found existing data");onProgress({stage:"blank-scan",verifiedBytes:address+65536,total:iA,verified:false});}
}`;
export const cleanPrepareBody = String.raw`if(A==="clean-reinstall"){
 const image=new Uint8Array(iA).fill(255),entries=[
  ["bootloader",0,i.bootloader,32768],
  ["partition-table",32768,i.table,4096],
  ["app",65536,i.app,s.partitions.find(p=>p[0]==="ota_0")[4]],
  ["otadata-initialize",IA,i.otaData,8192]
 ];
 const validated=entries.map(([kind,address,bytes,limit])=>this.#l(kind,address,bytes,limit));
 f(validated.every((region,index)=>validated.slice(0,index).every(other=>region.address>=other.address+other.wireBytes||region.address+region.wireBytes<=other.address)),"Overlapping clean installation images");
 for(const region of validated)image.set(region.bytes,region.address);
 // Keep each erase bounded: the transport deliberately caps a response wait at 5s.
 // A whole-flash FLASH_BEGIN could exceed that on real hardware.
 const regions=[];for(let address=0;address<iA;address+=65536)regions.push(this.#l("clean-reinstall",address,image.slice(address,address+65536),65536));
 const digest=await b(image),appDigest=await b(i.app);
 const recovery="若断电、取消或读回失败，设备可能暂时不能启动。重新进入下载模式并干净重装，或用已保存的完整备份和匹配工具恢复；网页无自动回滚。";
 const plan=V({id:this.#s+"-"+(++this.#b)+"-clean-"+digest.slice(0,16),mode:"clean-reinstall",title:"干净重装",impact:"清空全部16 MiB内部Flash，包括内部设置、阅读进度和文件；安装官网匹配的bootloader、分区表、应用与OTA初始记录。TF/SD卡不改动。",warnings:["此操作会清空设备内部数据，备份可选；未备份的数据不能恢复。","尚未完成真机验证。请保持供电和USB连接；全片覆盖可能需要数分钟，完成读回校验仍需检查实际启动。"],recovery,executable:true,blockedReason:null,storageProof:null,backupAllowed:true,generation:this.#s,backupRequired:false,destructive:true,dataEffect:"erase-internal",appPartition:"ota_0",address:0,bytes:iA,wireBytes:iA,eraseBytes:iA,sha256:digest,targetAppSha256:appDigest,version:s.version,confirmationPhrase:null,runningSlot:null,bootSelection:this.#A.bootSelection,boardVerified:false,modelVerified:false,images:validated.map(x=>({kind:x.kind,address:x.address,bytes:x.bytes.length,sha256:s.images[({"partition-table":"partitionTable","otadata-initialize":"otaData"})[x.kind]||x.kind].sha256})),writeRegions:regions.map(region=>({kind:region.kind,address:region.address,eraseBytes:region.wireBytes}))});
 this.#Y.set(plan,{generation:this.#s,regions,conditions:[],metadata:null,migration:null,cleanReinstall:true,backup:null,backupConditions:[],consumed:false});return plan;
}`;
export function replaceExactly(source,oldText,newText){if(source.split(oldText).length!==2)throw Error('Expected unique reviewed fragment: '+oldText);return source.replace(oldText,newText);}
export const readSessionMethod = String.raw`async #o(t,A){
 this.#i();f(Number.isSafeInteger(t)&&Number.isSafeInteger(A)&&t>=0&&A>0&&A<=65536&&t+A<=iA,"Read range bound");this.#S={start:t,size:A,ack:0};
 try{const bytes=await this.#t.readFlash(t,A);f(bytes.length===A,"Short/overlong flash read");const digest=await this.#Q.read(5e3);f(digest.length===16&&Ue(digest)===qt(bytes),"Read trailing MD5 mismatch");const d=this.#t.connection.read;d.md5Verified=true;d.currentStep="complete";return bytes;}
 catch(error){if(this.#t.connection.read)this.#t.connection.read.failed=true;throw error;}finally{this.#S=null;}
}`;

export function adaptConstructor(source){
 let output=replaceExactly(source,'new vt({transport:this.#Q,','new VerifiedESPLoader({transport:this.#Q,serialOptions:{bufferSize:65536},');
 const setup=';this.#t.connection.serialBufferSize=65536;t.readLoop='+verifiedReadLoop+';t.onSerialReadError=error=>{const d=this.#t.connection,errors=d.receiveErrors||(d.receiveErrors={count:0,events:[]});errors.count++;const name=String(error?.name||"Error").slice(0,64);if(errors.events.length<8)errors.events.push({name,stage:d.stage,currentStep:d.read?.currentStep??null,message:String(error?.message||error).slice(0,160)});if(this.#r.signal.aborted)return true;if(!this.#r.signal.aborted&&(this.#S||this.#e==="writing"||this.#e==="uploading-stub")){this.cancel("SERIAL_RECEIVE_LOSS: "+name);return true;}return false;};t.setDeviceLostCallback';
 output=replaceExactly(output,'this.#e==="connecting","Reset signals forbidden after connection"','["connecting","resetting"].includes(this.#e),"Reset signals require connection or verified restart"');
 output=replaceExactly(output,'this.#r.signal.aborted||this.cancel("DEVICE_DISCONNECTED")','this.#r.signal.aborted||this.#e==="resetting"||this.cancel("DEVICE_DISCONNECTED")');
 output=replaceExactly(output,'t.setDeviceLostCallback(()=>this.cancel("DEVICE_DISCONNECTED"))','t.setDeviceLostCallback(()=>{if(this.#e!=="resetting")this.cancel("DEVICE_DISCONNECTED")})');
 return replaceExactly(output,',t.setDeviceLostCallback',setup);
}

export function replacements(methods){
 const get=name=>{if(!methods.has(name))throw Error('Missing method '+name);return methods.get(name);};
 let prepare=get('prepare');prepare=replaceExactly(prepare,'backup:null,consumed:!1','backup:null,backupConditions:[],consumed:!1');prepare=replaceExactly(prepare,'backupRequired:!0','backupRequired:h==="single-slot-migration"');
 prepare=replaceExactly(prepare,'f(A==="auto","AUTO_PLAN_REQUIRED: manual slot selection is unsupported")','f(["auto","clean-reinstall"].includes(A),"SUPPORTED_PLAN_REQUIRED: auto or clean-reinstall")');
 prepare=replaceExactly(prepare,'f(this.#A.layout!=="unknown","UNKNOWN_LAYOUT_REFUSE_WRITE")',cleanPrepareBody+'f(this.#A.layout!=="unknown","UNKNOWN_LAYOUT_REFUSE_WRITE")');
 prepare=replaceExactly(prepare,'confirmationPhrase:`${g?"UPDATE":R?"MIGRATE":"INSTALL"} ${this.#A.mac} ${s.version}`','confirmationPhrase:null');
 const strings=[...prepare.matchAll(/"(?:\\.|[^"\\])*"/g)];
 for(const item of strings){let value;try{value=JSON.parse(item[0]);}catch{continue;}
  if(value.startsWith('首次安装或分区迁移不具备双槽升级的掉电原子性'))prepare=replaceExactly(prepare,item[0],JSON.stringify('首次安装与分区迁移均非掉电原子操作。新机写前完整只读扫描确认全FF；单槽迁移必须保存可恢复的完整备份。中断后可能需要外部工具恢复，网页无自动恢复。'));
  if(value.startsWith('保留本次16MiB备份。若底座切换中断'))prepare=replaceExactly(prepare,item[0],'(R?'+item[0]+':'+JSON.stringify('新机首次写入前会完整只读扫描16MiB确认全FF；若写入中断，须用匹配工具与固件恢复，网页无自动恢复。')+')');
 }

 let execute=get('execute');execute=replaceExactly(execute,'a?.plan===t&&a.generation===this.#s&&n.backup&&a.backup===n.backup','a?.plan===t&&a.generation===this.#s&&(!t.backupRequired||n.backup&&a.backup===n.backup)');
 execute=replaceExactly(execute,'Explicit current-session and current-backup confirmation required','Explicit current-session and required-backup confirmation required');
 execute=replaceExactly(execute,'await this.#m(n);let r=','await this.#m(n,s);let r=');
 execute=replaceExactly(execute,'g.kind==="app"&&(o=R)','["app","clean-reinstall"].includes(g.kind)&&(o=R)');

 let snapshot=get('snapshot');snapshot=replaceExactly(snapshot,'error:this.#E','error:this.#E,security:this.#security?structuredClone(this.#security):null,connection:structuredClone(this.#t.connection)');
 let connect=get('connect');connect=replaceExactly(connect,'FULL_BACKUP_MUST_PROVE_ALL_FLASH_ERASED','FULL_SCAN_REQUIRED_BEFORE_FIRST_WRITE');
 connect=replaceExactly(connect,'await this.#t.detectChip("default_reset",2)','this.#t.setConnectionStage("rom-sync"),await this.#t.detectChip("default_reset",2)');
 connect=replaceExactly(connect,'await this.#H()','this.#t.setConnectionStage("rom-security"),await this.#H()');
 connect=replaceExactly(connect,'A=await t.getMajorChipVersion(this.#t)*100+await t.getMinorChipVersion(this.#t)','A=(this.#t.setConnectionStage("rom-revision"),await t.getMajorChipVersion(this.#t)*100+await t.getMinorChipVersion(this.#t))');
 connect=replaceExactly(connect,'i=await t.readMac(this.#t)','i=(this.#t.setConnectionStage("rom-mac"),await t.readMac(this.#t))');
 connect=replaceExactly(connect,'await this.#t.runStub()','this.#t.setConnectionStage("stub-upload"),await this.#t.runStub()');
 connect=replaceExactly(connect,'await this.#t.flashSpiAttach(0)','this.#t.setConnectionStage("stub-spi-attach"),await this.#t.flashSpiAttach(0)');
 connect=replaceExactly(connect,'let s=await this.#k()','this.#t.setConnectionStage("flash-id");let s=await this.#k()');
 connect=replaceExactly(connect,'let n=await this.#o(32768,4096)','this.#t.setConnectionStage("partition-read");let n=await this.#o(32768,4096)');
 connect=replaceExactly(connect,'if(h==="dual"&&_?.images){','if(h==="dual"&&_?.images){this.#t.setConnectionStage("existing-bootloader-read");');
 connect=replaceExactly(connect,'this.#M=await this.#o(IA,8192)','this.#t.setConnectionStage("ota-read"),this.#M=await this.#o(IA,8192)');
 connect=replaceExactly(connect,'return this.#i(),this.#A=','return this.#i(),this.#t.setConnectionStage("ready"),this.#A=');

 prepare=replaceExactly(prepare,'let C=s.partitions.find(T=>T[0]===this.#A.bootSelection),B=await this.#w(C[3],C[4]),M=B.slice(0,Fi(B));await xi(M,this.#t.chip,this.#n,this.#A.revision,{existing:!0}),a.push({address:C[3],size:M.length,sha256:await b(M)}),','');
 let write=get('#v');const tail='f(await this.#t.flashMd5sum(t.address,t.bytes.length)===qt(t.bytes),"Written flash MD5 mismatch")';const tailAt=write.indexOf(tail);if(tailAt<0)throw Error('Expected original write verification tail');write=write.slice(0,tailAt)+'const deviceMd5=await this.#t.flashMd5sum(t.address,t.bytes.length);f(deviceMd5===qt(t.bytes),"Written flash MD5 mismatch");A({acknowledgedBytes:this.#d,total:i,stage:"device-md5-verified",region:t.kind,verified:false});this.#C=null;return deviceMd5}';write=replaceExactly(write,'await this.#t.flashFinish(!1,5e3),const','await this.#t.flashFinish(!1,5e3);const');
 execute=replaceExactly(execute,'readbackSha256:o','readbackSha256:null,sha256ReadbackVerified:false,verificationMethod:"device-md5",imageSha256:t.sha256,verifiedRegionCount:n.regions.length,deviceMd5:t.mode==="dual-slot-update"?o:null');
 execute=replaceExactly(execute,'partitionSectorSha256:await b(await this.#o(32768,4096))','partitionSectorSha256:null');
 execute=replaceExactly(execute,'ota:Vt(await this.#o(IA,8192))','ota:n.verifiedOTA??null');
 execute=replaceExactly(execute,'"OTA_COMMIT_READBACK_MISMATCH")}','"OTA_COMMIT_READBACK_MISMATCH"),n.verifiedOTA=g}');
 execute=replaceExactly(execute,'stage:"readback-verified"','stage:"device-md5-verified"');
 connect=replaceExactly(connect,'connect(){','connect({mode:connectionMode="auto"}={}){');
 const cleanConnect='if(connectionMode==="clean-reinstall"){this.#i();this.#A={chip:"esp32s3",revision:A,mac:i,flashId:s,capacity:iA,partitionSha256:null,partitionSectorSha256:null,partitions:[],layout:"unread",layoutId:null,reason:"EXPLICIT_CLEAN_CONNECTION",ota:null,bootloaderMatched:false,bootloaderIdentity:null,runningSlot:null,bootSelection:null,boardVerified:false,modelVerified:false,operatorSelection:this.#G,stub:"OFFICIAL_SDK_UPLOADED"};this.#t.setConnectionStage("ready-clean");this.#e="ready";return this.snapshot()}';
 connect=replaceExactly(connect,'this.#t.setConnectionStage("partition-read");let n=',cleanConnect+'this.#t.setConnectionStage("partition-read");let n=');

 // Read OTA geometry from the verified device table; bind target-required labels and geometry separately.
 const classification='fA(a)?(h="blank",o="blank-flash-candidate",g="FULL_SCAN_REQUIRED_BEFORE_FIRST_WRITE"):_&&R===_.partitionSha256&&JSON.stringify(r)===JSON.stringify(_.partitions)?(h="dual",o="target-dual",g=null):(this.#B=_?.knownLayouts?.find(w=>w.partitionSha256===R&&JSON.stringify(w.partitions)===JSON.stringify(r))||null,this.#B&&(h="single",o=this.#B.id,g=null));';
 const geometry='const apps=r.filter(p=>p[1]===0),ota0=apps.find(p=>p[2]===16),ota1=apps.find(p=>p[2]===17),otaData=r.filter(p=>p[1]===1&&p[2]===0);const dual=apps.length===2&&ota0&&ota1&&otaData.length===1&&otaData[0][4]===8192;const appLayoutMismatches=_.partitions.filter(p=>!r.some(q=>JSON.stringify(q)===JSON.stringify(p))).map(p=>({expected:p,actual:r.find(q=>q[0]===p[0])||null})),appLayoutCompatible=dual&&!appLayoutMismatches.length;fA(a)?(h="blank",o="blank-flash-candidate",g="FULL_SCAN_REQUIRED_BEFORE_FIRST_WRITE"):dual?(h="dual",o="device-dual",g=null):(this.#B=_?.knownLayouts?.find(w=>w.partitionSha256===R&&JSON.stringify(w.partitions)===JSON.stringify(r))||null,this.#B&&(h="single",o=this.#B.id,g=null));';
 connect=replaceExactly(connect,classification,geometry);
 const bootStart=connect.indexOf('if(h==="dual"&&_?.images){'),bootEnd=connect.indexOf('return this.#i()',bootStart);
 if(bootStart<0||bootEnd<0)throw Error('Missing reviewed dual discovery');
 connect=connect.slice(0,bootStart)+'if(h==="dual"){this.#t.setConnectionStage("ota-read");this.#M=await this.#o(otaData[0][3],8192);S=Vt(this.#M);if(!S.safe)g=S.reason;}'+connect.slice(bootEnd);
 connect=replaceExactly(connect,'bootloaderIdentity:d,runningSlot:null','bootloaderIdentity:d,appLayoutCompatible,appLayoutMismatches,otaDataAddress:h==="dual"?otaData[0][3]:null,runningSlot:null');
 prepare=replaceExactly(prepare,'f(this.#A.bootloaderMatched,"BOOTLOADER_CONTRACT_MISMATCH");let E=await this.#o(IA,8192);','f(this.#A.appLayoutCompatible,"APP_LAYOUT_INCOMPATIBLE: "+JSON.stringify(this.#A.appLayoutMismatches));let E=await this.#o(this.#A.otaDataAddress,8192);');
 prepare=replaceExactly(prepare,'g=Ea(Vt(E)),o=g.target','g=Ea(Vt(E)),g.address=this.#A.otaDataAddress+g.index*4096,o=g.target');
 prepare=replaceExactly(prepare,'a.push({address:IA,size:8192,sha256:await b(E)},{address:0,size:this.#A.bootloaderIdentity.bytes,sha256:this.#A.bootloaderIdentity.sha256})','a.push({address:this.#A.otaDataAddress,size:8192,sha256:await b(E)})');
 prepare=replaceExactly(prepare,'let I=s.partitions.find(E=>E[0]===o);','let I=g?this.#A.partitions.find(E=>E[1]===0&&E[2]===(o==="ota_0"?16:17)):s.partitions.find(E=>E[0]===o);');
 // Bootloader selection is a subtype, not a user-chosen label. Preserve the device label separately.
 prepare=replaceExactly(prepare,'appPartition:o,address:I[3]','appPartition:o,devicePartitionLabel:I[0],otaDataAddress:g?this.#A.otaDataAddress:null,address:I[3]');
 for(const match of [...prepare.matchAll(/"(?:\\.|[^"\\])*"/g)]){let value;try{value=JSON.parse(match[0]);}catch{continue;}if(value.includes('保留完整备份。提交结果'))prepare=replaceExactly(prepare,match[0],JSON.stringify('失败或中断后断开并重新连接，重新读取启动选择记录后再规划；原启动槽与内部数据保留，完整备份可选。提交结果不确定时以重新读取的元数据为准。'));}
 execute=execute.replaceAll('this.#o(IA,8192)','this.#o(this.#A.otaDataAddress,8192)');
 execute=replaceExactly(execute,'let R=await this.#v(g,s,r,h);','if(g.kind==="otadata-commit")this.#t.connection.otaCommitAttempted=true;let R=await this.#v(g,s,r,h);if(g.kind==="app")this.#t.connection.appMd5Verified=true;');
 execute=replaceExactly(execute,'n.verifiedOTA=g}','n.verifiedOTA=g,this.#t.connection.otaCommitVerified=true}');
 execute=replaceExactly(execute,'bootloaderMatched:!0,bootloaderIdentity:n.metadata?','bootloaderMatched:n.metadata?this.#A.bootloaderMatched:true,bootloaderIdentity:n.metadata?');
 execute=replaceExactly(execute,'partitionSha256:this.#n.package.partitionSha256,partitionSectorSha256:null,partitions:this.#n.package.partitions','partitionSha256:n.metadata?this.#A.partitionSha256:this.#n.package.partitionSha256,partitionSectorSha256:n.metadata?this.#A.partitionSectorSha256:null,partitions:n.metadata?this.#A.partitions:this.#n.package.partitions');

 const cancel=String.raw`cancel(t="CANCELLED"){if(this.#r.signal.aborted)return;const resetting=this.#e==="resetting";this.#E=t;this.#s++;this.#C=null;this.#r.abort();this.#e="cancelled";if(!resetting)this.#_();}`;
 return new Map([['cancel',cancel],['#o',readSessionMethod],['#v',write],['#H',securityMethod],['#m',prewriteMethod],['confirm',confirmMethod],['prepare',prepare],['execute',execute],['snapshot',snapshot],['connect',connect]]);
}

// Only a completed, verified write can enter this signal-only restart. No Flash commands.
export const restartMethod=String.raw`restart(){return this.#x(async()=>{
 f(this.#e==="complete"&&!this.#t.connection.restartAttempted,"RESTART_REQUIRES_UNCONSUMED_VERIFIED_WRITE");this.#t.connection.restartAttempted=true;this.#e="resetting";
 const info=this.#a.getInfo?.()||{},usb=info.usbVendorId===0x303a;
 const receipt={writeVerified:true,resetCommandSent:false,bootHealthVerified:false,method:"hard_reset",usbDelay:usb,error:null};
 this.#t.setConnectionStage("hard-reset");
 try{await this.#Q.setDTR(false);await this.#Q.setRTS(true);await new Promise(resolve=>setTimeout(resolve,usb?200:100));await this.#Q.setRTS(false);receipt.resetCommandSent=true;if(usb)await new Promise(resolve=>setTimeout(resolve,200));}
 catch(error){receipt.error=String(error.message||error);}
 finally{
  // Release RTS even after cancellation; this is signal cleanup, never a Flash command.
  if(!receipt.resetCommandSent)try{await this.#g.setRTS(false);}catch(error){receipt.releaseError=String(error.message||error);}
  await this.#_();receipt.portCloseUncertain=this.#F;
  if(!this.#r.signal.aborted)this.#e="complete";
  this.#t.connection.restart=structuredClone(receipt);
 }
 return V(receipt);
 },{fatal:false});}`;
