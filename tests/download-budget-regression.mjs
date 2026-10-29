// Bounded developer checks of production download APIs over native Web Streams.
// The real 18-second gzip/browser path is separately exercised; no accelerated budgets.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out=process.argv[2];assert.ok(out);await mkdir(out);
const site=new URL('../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const {loadOwnerPolicy,createController}=await import(new URL('real-flash/engine.js',site));
const owner=await readFile(new URL('firmware-target.json',site)),target=JSON.parse(owner).target,files=new Map([['firmware-target.json',owner]]);
for(const item of [target.manifest,...Object.values(target.images)]){const bytes=await readFile(new URL(item.url,site));assert.equal(sha(bytes),item.sha256);files.set(item.url,bytes);}
let mode='normal',requests=[],streams=[];
globalThis.fetch=async(url,options={})=>{
 const key=[...files.keys()].find(k=>String(url).endsWith('/'+k));assert.ok(key);const req={key,mode,options};requests.push(req);
 assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
 if(key==='firmware-target.json')return new Response(files.get(key));
 const active=mode;let bytes=files.get(key);
 if(active==='fetch')throw new TypeError('simulated fetch rejection; cause unknown');
 if(active==='http')return new Response('unavailable',{status:503});
 if(active==='short')bytes=bytes.subarray(0,bytes.length-1);
 if(active==='oversize'){const bigger=new Uint8Array(bytes.length+1);bigger.set(bytes);bytes=bigger;}
 if(active==='hash'){bytes=Uint8Array.from(bytes);bytes[0]^=1;}
 let cancelled=false;const body=new ReadableStream({start(controller){
  if(active==='cancel-body'){controller.enqueue(bytes.subarray(0,1));return;}
  controller.enqueue(bytes);controller.close();
 },cancel(){cancelled=true;}});streams.push(body);req.cancelled=()=>cancelled;
 const response=new Response(body);
 if(active==='cancel-headers')return new Promise(resolve=>setTimeout(()=>resolve(response),200));
 return response;
};
const policy=await loadOwnerPolicy(),results=[];
for(const [id,fault,expected] of [['HTTP_STATUS','http',/HTTP_ERROR/],['FETCH_CAUSE_UNKNOWN','fetch',/FETCH_FAILED/],['DECODED_SHORT','short',/SIZE_MISMATCH/],['DECODED_OVER_LIMIT','oversize',/SIZE_LIMIT/],['OWNER_HASH','hash',/HASH_MISMATCH/],['CANCEL_HEADERS_LATE_RESPONSE','cancel-headers',/CANCELLED_DOWNLOAD/],['CANCEL_BODY','cancel-body',/CANCELLED_DOWNLOAD/]]){
 let error,observed,download,elapsed;mode=fault;requests=[];streams=[];
 try{
  const controller=createController({policy}),signal=new AbortController(),start=performance.now();
  const pending=controller.loadCandidate({signal:signal.signal});
  const timer=fault.startsWith('cancel')?setTimeout(()=>signal.abort(),40):null;
  try{await pending;throw Error('Expected rejection absent');}catch(e){observed=e.message;download=e.download;assert.match(e.message,expected);assert.ok(download);assert.equal(download.file,'manifest');assert.equal(download.budgets.totalMs,300000);assert.equal(download.budgets.headersMs,30000);assert.equal(download.budgets.idleMs,30000);}
  finally{clearTimeout(timer);elapsed=performance.now()-start;}
  assert.ok(requests.every(r=>r.options.signal.aborted),'failure aborts every started candidate fetch');
  if(fault==='http')assert.equal(download.httpStatus,503);
  if(fault==='fetch'){assert.equal(download.causeName,'TypeError');assert.equal(download.httpStatus,null);}
  if(fault.startsWith('cancel')){
   assert.ok(elapsed<500,'cancel rejects promptly');mode='normal';
   const fresh=await controller.loadCandidate();assert.equal(fresh.appBytes,3338288);
   await new Promise(resolve=>setTimeout(resolve,250));
   assert.ok(requests.find(r=>r.mode===fault).cancelled(),'pending or late response body cancelled');
  }
  assert.ok(streams.every(s=>!s.locked),'all readers released');
 }catch(e){error=e.stack;}
 const row={id,status:error?'FAIL':'PASS',error,observed,download,elapsedMs:elapsed};results.push(row);console.log(id,row.status);
}
mode='normal';const success=await createController({policy}).loadCandidate();assert.equal(success.appBytes,3338288);
await writeFile(out+'/report.json',JSON.stringify({results,engineSha256:sha(await readFile(new URL('real-flash/engine.js',site))),runnerSha256:sha(await readFile(new URL(import.meta.url))),scope:'bounded developer checks; native Web Streams; no browser or hardware; real browser slow gzip reported separately'},null,2));process.exitCode=results.every(r=>r.status==='PASS')?0:1;
