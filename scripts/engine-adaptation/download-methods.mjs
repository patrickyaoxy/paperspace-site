// Candidate downloads only. The exact legacy owner-config branches remain below.
import {replaceExactly} from './maintenance-methods.mjs';
const boundedDownload = String.raw`async function Zn(e,t,options={}){
 /*OWNER_TIMEOUT_BRANCH*/
 const controller=new AbortController(),started=performance.now();
 const budgets=Object.freeze({totalMs:300000,headersMs:30000,idleMs:30000});
 let reason=null,rejectStop;
 const stopped=new Promise((resolve,reject)=>{rejectStop=reject;});
 const scope={budgets,current:null};
 const detail=()=>{const c=scope.current||{};return {build:"paperspace-download-budget-1",file:c.file??null,phase:c.phase??"starting",httpStatus:c.httpStatus??null,expectedDecodedBytes:c.expectedDecodedBytes??null,receivedDecodedBytes:c.receivedDecodedBytes??0,elapsedMs:performance.now()-started,requestElapsedMs:c.started===undefined?null:performance.now()-c.started,budgets};};
 scope.fail=(code,cause)=>{
  if(reason)return reason;
  reason=code instanceof Error?code:new Error(code);reason.code||=reason.message;
  reason.download=Object.freeze({...detail(),causeName:cause?String(cause.name||"Error").slice(0,64):null,causeMessage:cause?String(cause.message||cause).slice(0,160):null});
  controller.abort(reason);rejectStop(reason);return reason;
 };
 scope.check=()=>{if(reason)throw reason;if(performance.now()-started>=budgets.totalMs)throw scope.fail("TRUSTED_DOWNLOAD_TOTAL_TIMEOUT");};
 scope.wait=async pending=>{const task=Promise.resolve(pending);task.catch(()=>{});scope.check();const value=await Promise.race([task,stopped]);scope.check();return value;};
 const cancel=()=>scope.fail("CANCELLED_DOWNLOAD");
 t?.addEventListener("abort",cancel,{once:true});if(t?.aborted)cancel();
 const timer=setTimeout(()=>scope.fail("TRUSTED_DOWNLOAD_TOTAL_TIMEOUT"),budgets.totalMs);
 // Attach a handler even if a pre-aborted signal prevents starting the work.
 stopped.catch(()=>{});
 try{scope.check();const value=await scope.wait(Promise.resolve().then(()=>{scope.check();return e(controller.signal,scope);}));scope.check();return value;}
 catch(error){throw reason||scope.fail(error,error);}
 finally{clearTimeout(timer);t?.removeEventListener("abort",cancel);}
}`;

const streamingDownload = String.raw`async function $n(e,t,{signal:A,exact:i,onProgress:s=()=>{},download:d,file="unknown"}={}){
 /*OWNER_STREAM_BRANCH*/
 d.check();const c=d.current={file,phase:"headers",httpStatus:null,expectedDecodedBytes:i??null,receivedDecodedBytes:0,started:performance.now()};
 let reader=null,headersTimer,idleTimer,idleDeadline=null;
 const resetIdle=()=>{clearTimeout(idleTimer);idleDeadline=performance.now()+d.budgets.idleMs;idleTimer=setTimeout(()=>d.fail("TRUSTED_DOWNLOAD_STALL_TIMEOUT"),d.budgets.idleMs);};
 try{
  headersTimer=setTimeout(()=>d.fail("TRUSTED_DOWNLOAD_HEADERS_TIMEOUT"),d.budgets.headersMs);
  let response;
  try{response=await d.wait(fetch(e,{signal:A,credentials:"omit",redirect:"error",cache:"no-store",referrerPolicy:"no-referrer"}).then(value=>{if(A.aborted){try{Promise.resolve(value.body?.cancel()).catch(()=>{});}catch{}d.check();}return value;}));}
  catch(error){throw d.fail("TRUSTED_DOWNLOAD_FETCH_FAILED",error);}
  clearTimeout(headersTimer);c.httpStatus=response.status;
  if(performance.now()-c.started>=d.budgets.headersMs)throw d.fail("TRUSTED_DOWNLOAD_HEADERS_TIMEOUT");
  if(!response.ok)throw d.fail("TRUSTED_DOWNLOAD_HTTP_ERROR");
  if(response.type==="opaque"||response.redirected||response.url&&response.url!==e)throw d.fail("TRUSTED_DOWNLOAD_RESPONSE_REJECTED");
  const length=response.headers.get("content-length");
  // Content-Length may describe gzip wire bytes. It is never equated to decoded size.
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>t))throw d.fail("TRUSTED_DOWNLOAD_SIZE_HEADER");
  if(!response.body?.getReader)throw d.fail("TRUSTED_DOWNLOAD_STREAM_REQUIRED");
  reader=response.body.getReader();c.phase="body";resetIdle();let received=0;const chunks=[];
  for(;;){
   d.check();let packet;
   try{packet=await d.wait(reader.read());}catch(error){throw d.fail("TRUSTED_DOWNLOAD_FETCH_FAILED",error);}
   if(performance.now()>=idleDeadline)throw d.fail("TRUSTED_DOWNLOAD_STALL_TIMEOUT");
   if(packet.done)break;
   const bytes=packet.value;if(bytes.length===0)continue;
   received+=bytes.length;c.receivedDecodedBytes=received;
   if(received>t)throw d.fail("TRUSTED_DOWNLOAD_SIZE_LIMIT");
   chunks.push(bytes);resetIdle();s({receivedBytes:received,total:i??null});d.check();
  }
  clearTimeout(idleTimer);c.phase="length";d.check();
  if(i!==undefined&&received!==i)throw d.fail("TRUSTED_DOWNLOAD_SIZE_MISMATCH");
  const result=new Uint8Array(received);let offset=0;for(const bytes of chunks){result.set(bytes,offset);offset+=bytes.length;}return result;
 }finally{
  clearTimeout(headersTimer);clearTimeout(idleTimer);
  if(reader){try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}try{reader.releaseLock();}catch{}}
 }
}`;

const candidateDownload = String.raw`async function Aa(e,t={}){
 const owner=Ti(e);f(e.enabled,"FORMAL_PACKAGE_DISABLED");const target=e.target,files={};let completedScope;
 await Zn(async(signal,download)=>{
  completedScope=download;for(const [file,item] of Object.entries({manifest:target.manifest,...target.images})){
   download.check();const bytes=await $n(owner.urls[file],item.bytes,{signal,exact:item.bytes,download,file,onProgress:event=>t.onProgress?.({file,...event})});
   download.current.phase="hash";const digest=await b(bytes);download.check();
   if(digest!==item.sha256)throw download.fail("TRUSTED_DOWNLOAD_HASH_MISMATCH");files[file]=bytes;
  }
  download.current.phase="complete";download.check();
 },t.signal,{candidate:true});
 if(t.signal?.aborted)throw completedScope.fail("CANCELLED_DOWNLOAD");completedScope.check();
 const candidate=V({source:"OWNER_PINNED_RAW_IMAGES",version:target.version,appBytes:target.images.app.bytes});
 return Xn.set(candidate,{policy:e,candidate:{manifestBytes:files.manifest,files:Object.fromEntries(Object.entries(target.images).map(([key,item])=>[item.file,files[key]]))}}),candidate;
}`;

export function downloadReplacements(functions){
 const oldTimeout=functions.get('Zn'),oldStream=functions.get('$n');
 const ownerTimeout=replaceExactly(oldTimeout,'async function Zn(e,t){','if(!options.candidate){');
 const ownerStream=replaceExactly(oldStream,'async function $n(e,t,{signal:A,exact:i,onProgress:s=()=>{}}={}){','if(!d){');
 return new Map([
  ['Zn',replaceExactly(boundedDownload,'/*OWNER_TIMEOUT_BRANCH*/',ownerTimeout)],
  ['$n',replaceExactly(streamingDownload,'/*OWNER_STREAM_BRANCH*/',ownerStream)],
  ['Aa',candidateDownload]
 ]);
}
