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
}`;
export const securityMethod = String.raw`async #H(){
 const rom=this.#e==="connecting",previous=this.#security;
 const d={stage:rom?"rom-security":"prewrite-security",status:"reading",attempts:[],romVerified:false,romInfo:null,efuse:null};this.#security=d;
 const stop=(code,detail)=>{d.status="blocked";d.code=code;if(detail)d.detail=detail;const error=new Error(code+": "+JSON.stringify(d));error.code=code;throw error;};
 const word=v=>Number.isSafeInteger(v)&&v>=-2147483648&&v<=4294967295;
 const pop=v=>{let n=0;for(;v;v&=v-1)n++;return n;};
 const knownPurpose=v=>Number.isInteger(v)&&(v===0||v>=2&&v<=11);
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
  if(!info.keyPurposes.slice(0,6).every(knownPurpose))stop("SECURITY_UNKNOWN_PURPOSE","S3 hardware key purposes 0..5");
  if(info.keyPurposes[6]!==0)stop("SECURITY_RESERVED_PURPOSE_UNSUPPORTED","Generic wire slot 6 is not a seventh S3 hardware key");
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
 if(versionBits!==0)stop("ANTI_ROLLBACK_SECURE_VERSION_UNSUPPORTED","Current target secure_version=0 and boot antiRollback=false");
 if(!purposes.every(knownPurpose))stop("SECURITY_UNKNOWN_PURPOSE","S3 RO hardware key purpose");
 if(crypt!==info.flashCryptCnt||secureBoot!==!!(info.flags&1)||secureDownload!==!!(info.flags&4)||purposes.some((v,i)=>v!==info.keyPurposes[i]))stop("SECURITY_EFUSE_MISMATCH","ROM information and read-only eFuse fields disagree");
 d.romVerified=true;d.status="verified";d.code="SECURITY_UNPROTECTED_COMPATIBLE";return d;
}`;
export const confirmMethod = String.raw`confirm(t,{installAccepted:A,backupSha256:i,backupSaved:s}={}){
 f(!this.#f,"BUSY");this.#i();let n=this.#y(t);f(t.executable,t.blockedReason||"PLAN_NOT_EXECUTABLE");
 f(A===true,"Explicit current-plan installation acceptance required");
 if(t.backupRequired)f(n.backup&&s===true&&i===n.backup.sha256,"Current full migration backup must be saved and acknowledged");
 let a=V({planId:t.id,backupSha256:t.backupRequired?i:null,impactAcknowledged:true});
 this.#u.set(a,{plan:t,generation:this.#s,backup:t.backupRequired?n.backup:null});return a;
}`;
export const prewriteMethod = String.raw`async #m(t,onProgress=()=>{}){
 await this.#H();f(await this.#k()===this.#A.flashId&&await this.#t.chip.readMac(this.#t)===this.#A.mac,"Device identity changed");
 for(let A of [...t.conditions,...t.backupConditions])f(await b(await this.#w(A.address,A.size))===A.sha256,"Device precondition changed before write");
 if(this.#A.layout==="blank")for(let address=0;address<iA;address+=65536){this.#i();f(fA(await this.#o(address,Math.min(65536,iA-address))),"BLANK_FLASH_NOT_EMPTY: full read-only scan found existing data");onProgress({stage:"blank-scan",verifiedBytes:address+65536,total:iA,verified:false});}
}`;
export function replaceExactly(source,oldText,newText){if(source.split(oldText).length!==2)throw Error('Expected unique reviewed fragment: '+oldText);return source.replace(oldText,newText);}
export function replacements(methods){
 const get=name=>{if(!methods.has(name))throw Error('Missing method '+name);return methods.get(name);};
 let prepare=get('prepare');prepare=replaceExactly(prepare,'backup:null,consumed:!1','backup:null,backupConditions:[],consumed:!1');prepare=replaceExactly(prepare,'backupRequired:!0','backupRequired:h==="single-slot-migration"');
 prepare=replaceExactly(prepare,'confirmationPhrase:`${g?"UPDATE":R?"MIGRATE":"INSTALL"} ${this.#A.mac} ${s.version}`','confirmationPhrase:null');
 const strings=[...prepare.matchAll(/"(?:\\.|[^"\\])*"/g)];
 for(const item of strings){let value;try{value=JSON.parse(item[0]);}catch{continue;}
  if(value.startsWith('首次安装或分区迁移不具备双槽升级的掉电原子性'))prepare=replaceExactly(prepare,item[0],JSON.stringify('首次安装与分区迁移均非掉电原子操作。新机写前完整只读扫描确认全FF；单槽迁移必须保存可恢复的完整备份。中断后可能需要外部工具恢复，网页无自动恢复。'));
  if(value.startsWith('保留本次16MiB备份。若底座切换中断'))prepare=replaceExactly(prepare,item[0],'(R?'+item[0]+':'+JSON.stringify('新机首次写入前会完整只读扫描16MiB确认全FF；若写入中断，须用匹配工具与固件恢复，网页无自动恢复。')+')');
 }

 let execute=get('execute');execute=replaceExactly(execute,'a?.plan===t&&a.generation===this.#s&&n.backup&&a.backup===n.backup','a?.plan===t&&a.generation===this.#s&&(!t.backupRequired||n.backup&&a.backup===n.backup)');
 execute=replaceExactly(execute,'Explicit current-session and current-backup confirmation required','Explicit current-session and required-backup confirmation required');
 execute=replaceExactly(execute,'await this.#m(n);let r=','await this.#m(n,s);let r=');
 let snapshot=get('snapshot');snapshot=replaceExactly(snapshot,'error:this.#E','error:this.#E,security:this.#security?structuredClone(this.#security):null');
 let connect=get('connect');connect=replaceExactly(connect,'FULL_BACKUP_MUST_PROVE_ALL_FLASH_ERASED','FULL_SCAN_REQUIRED_BEFORE_FIRST_WRITE');
 return new Map([['#H',securityMethod],['#m',prewriteMethod],['confirm',confirmMethod],['prepare',prepare],['execute',execute],['snapshot',snapshot],['connect',connect]]);
}
