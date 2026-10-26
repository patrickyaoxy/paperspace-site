'use strict';
(() => {
 // Public, immutable program assets only. Nothing is fetched until prepare().
 // The compression script regenerates this manifest from the retained originals.
 const MANIFEST = /* ASSET_MANIFEST_BEGIN */ {"schema":1,"source":{"tag":"v2.0.8","tag_object":"acb367c417207757c2253401f065b9462d159ba5","commit":"79f2f5ad303b9a588d551e3e0eb4b6e5735bc56b","tree":"ece5b78a3dee90448ee8ba57adf85eca08e728c7","production_source_modified":false},"compression":"gzip, level=9, mtime=0","assets":{"data":{"raw":{"path":"runtime/reader.data","bytes":29770400,"sha256":"361e0e7a55dd4b403c74826b003e4e1b256cc8564654928e419b09253465f080"},"gzip":{"path":"runtime/reader.data.gz","bytes":13664226,"sha256":"5ef9fd6fd6fe098063e0d645c5e8c53a5e09aa0f9e6181328e508c5abdffc920"}},"wasm":{"raw":{"path":"runtime/reader.wasm","bytes":3943347,"sha256":"1d458ce7b88e36d68fd39c7f3dc436eac2ab4d932e21b6fbc03daaf27d594b35"},"gzip":{"path":"runtime/reader.wasm.gz","bytes":1753415,"sha256":"99af91e62632b4b83a543b90807b5a6d2cb6cf5d0ba3606ed9b97f6a06818de9"}}}} /* ASSET_MANIFEST_END */;
 const root=new URL('.',document.currentScript.src),keys=['data','wasm'];
 const freeze=value=>{Object.values(value).forEach(item=>{if(item&&typeof item==='object')freeze(item);});return Object.freeze(value);};
 freeze(MANIFEST);
 let cached=null,active=null;
 const abortError=()=>new DOMException('体验资源准备已取消','AbortError');
 const hex=buffer=>Array.from(new Uint8Array(buffer),v=>v.toString(16).padStart(2,'0')).join('');
 function publish(job,phase){
  job.progress=Object.freeze({phase,received:job.received,total:job.total,transport:job.transport});
  for(const listener of job.listeners){try{listener(job.progress);}catch(error){console.error('体验资源进度回调失败',error);}}
 }
 function check(job){if(job.controller.signal.aborted)throw job.controller.signal.reason||abortError();}
 async function verify(job,buffer,identity,name){
  check(job);
  if(buffer.byteLength!==identity.bytes)throw Error(name+'资源长度校验失败');
  const digest=await crypto.subtle.digest('SHA-256',buffer);check(job);
  if(hex(digest)!==identity.sha256)throw Error(name+'资源完整性校验失败');
 }
 async function download(job,key){
  const entry=MANIFEST.assets[key][job.transport],url=new URL(entry.path,root);
  if(url.origin!==location.origin)throw Error('体验资源必须来自同源');
  let stall;
  const arm=()=>{clearTimeout(stall);stall=setTimeout(()=>job.controller.abort(Error('体验资源下载停滞，请重试')),30000);};
  arm();
  try{
   const response=await fetch(url,{signal:job.controller.signal,credentials:'same-origin'});check(job);
   if(!response.ok||!response.body)throw Error('体验资源下载失败：'+response.status);
   const reader=response.body.getReader(),bytes=new Uint8Array(entry.bytes);let offset=0;
   while(true){
    const {done,value}=await reader.read();check(job);if(done)break;
    arm();if(offset+value.byteLength>bytes.byteLength)throw Error('体验资源下载长度超出清单');
    bytes.set(value,offset);offset+=value.byteLength;job.received+=value.byteLength;publish(job,'download');
   }
   if(offset!==bytes.byteLength)throw Error('体验资源下载不完整');
   return bytes.buffer;
  }finally{clearTimeout(stall);}
 }
 async function run(job){
  const deadline=setTimeout(()=>job.controller.abort(Error('体验资源准备超时，请重试')),600000);
  try{
   publish(job,'download');
   const encoded=await Promise.all(keys.map(key=>download(job,key)));check(job);
   publish(job,'verify');
   await Promise.all(keys.map((key,i)=>verify(job,encoded[i],MANIFEST.assets[key][job.transport],key)));
   const result={};
   // Decode one package at a time, bounding temporary allocations on phones.
   for(let i=0;i<keys.length;i++){
    const key=keys[i];check(job);
    if(job.transport==='gzip'){
     publish(job,'decompress');
     result[key]=await new Response(new Blob([encoded[i]]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
     encoded[i]=null;check(job);publish(job,'verify');
     await verify(job,result[key],MANIFEST.assets[key].raw,key);
    }else result[key]=encoded[i];
   }
   check(job);cached=result;publish(job,'ready');
   return Object.freeze({transport:job.transport,bytes:job.total});
  }catch(error){job.controller.abort(error);throw error;}
  finally{clearTimeout(deadline);job.listeners.clear();if(active===job)active=null;}
 }
 function prepare({onProgress}={}){
  if(typeof crypto?.subtle?.digest!=='function')return Promise.reject(Error('浏览器不支持体验资源完整性校验'));
  if(cached){
   const progress=Object.freeze({phase:'ready',received:0,total:0,transport:'memory'});
   if(typeof onProgress==='function')onProgress(progress);
   return Promise.resolve(Object.freeze({transport:'memory',bytes:0}));
  }
  if(!active){
   const transport=typeof DecompressionStream==='function'?'gzip':'raw';
   const job={transport,total:keys.reduce((sum,key)=>sum+MANIFEST.assets[key][transport].bytes,0),received:0,controller:new AbortController(),listeners:new Set(),progress:null,promise:null};
   active=job;
   // Start after subscribers are attached, including simultaneous callers.
   job.promise=Promise.resolve().then(()=>run(job));
  }
  const job=active;
  if(typeof onProgress==='function'){job.listeners.add(onProgress);if(job.progress)onProgress(job.progress);}
  return job.promise;
 }
 function cancel(){const job=active;if(job){active=null;job.controller.abort(abortError());}}
 function getBundle(){return cached?Object.freeze({data:cached.data.slice(0),wasm:cached.wasm.slice(0)}):null;}
 Object.defineProperty(window,'PaperspaceRuntimeAssets',{value:Object.freeze({prepare,getBundle,cancel,manifest:MANIFEST}),writable:false,configurable:false});
})();
