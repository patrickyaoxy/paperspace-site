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

 connection={build:"paperspace-serial-handoff-1",stage:"new",lastOpcode:null,commands:0,events:[],handoff:null};
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
 this.#Y.set(plan,{generation:this.#s,regions,conditions:[{address:32768,size:4096,sha256:this.#A.partitionSectorSha256}],metadata:null,migration:null,cleanReinstall:true,backup:null,backupConditions:[],consumed:false});return plan;
}`;
export function replaceExactly(source,oldText,newText){if(source.split(oldText).length!==2)throw Error('Expected unique reviewed fragment: '+oldText);return source.replace(oldText,newText);}
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
 execute=replaceExactly(execute,'if(n.metadata){let g=','if(n.cleanReinstall){o=await b(await this.#w(0,iA));f(o===t.sha256,"Written full flash readback SHA-256 mismatch")}if(n.metadata){let g=');
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
 return new Map([['#H',securityMethod],['#m',prewriteMethod],['confirm',confirmMethod],['prepare',prepare],['execute',execute],['snapshot',snapshot],['connect',connect]]);
}
