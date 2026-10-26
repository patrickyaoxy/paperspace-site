'use strict';
var Module;
(() => {
 const WIDTH=684,HEIGHT=1216,canvas=document.querySelector('canvas'),context=canvas.getContext('2d',{alpha:false});
 const state={initialized:false,ready:false,busy:false,stopped:false,error:null,sequence:null,logs:[],observations:[],receipts:[],frames:[],books:0,fontReady:false,prepareStart:0,prepareDone:0,lastInput:0,config:null,frameMetrics:{headerReads:0,headerBytes:0,fullReads:0,fullBytes:0,imageAllocations:0}};
 let logSerial=0,ticket=0,pointer=null,internalId=0,frameTimer=null;
 const frameHeader=new Uint8Array(36),frameHeaderView=new DataView(frameHeader.buffer),frameLength=36+WIDTH*HEIGHT;
 let frameBytes=null,frameImage=null;
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const emit=(event,extra={})=>{if(parent!==window)parent.postMessage({type:'zhijian-runtime',event,...extra},location.origin);};
 const failure=(error,id,fatal=false)=>{const message=String(error?.message||error);state.lastError=message;if(fatal)state.error=message;emit('error',{id,message,sequence:state.sequence});if(fatal&&parent===window){canvas.hidden=true;let alert=document.getElementById('runtime-error');if(!alert){alert=document.createElement('p');alert.id='runtime-error';alert.setAttribute('role','alert');alert.style.cssText='padding:24px;font:16px/1.6 system-ui,sans-serif';document.body.append(alert);}alert.textContent=message;}};
 Object.defineProperty(window,'ZhijianRuntime',{value:Object.freeze({readState:()=>structuredClone(state)}),writable:false,configurable:false});
 function parseConfig(){
  const query=new URLSearchParams(location.search),allowed=new Set(['theme','night','reading','book','layout','runtime_rev']);
  for(const key of query.keys())if(!allowed.has(key)||query.getAll(key).length!==1)throw Error('不支持的体验配置：'+key);
  if(query.has('runtime_rev')&&query.get('runtime_rev')!=='20261026-perf1')throw Error('体验配置无效');
  const config={layout:query.get('layout')??'standard',theme:query.get('theme')??'chan',night:query.get('night')??'0',reading:query.get('reading')??'horizontal',book:query.has('book')?query.get('book'):null};
  if(!['standard','alternate'].includes(config.layout)||!['chan','soviet','bauhaus','cat'].includes(config.theme)||!['0','1'].includes(config.night)||!['horizontal','rtl','ltr'].includes(config.reading)||(config.book!==null&&!['0','1','2'].includes(config.book)))throw Error('体验配置无效');
  return config;
 }
 function fields(text){const value={};for(const part of text.trim().split(/\s+/)){const match=/^(\w+)=(-?\d+)$/.exec(part);if(!match||Object.hasOwn(value,match[1]))throw Error('原程序回执格式错误');value[match[1]]=Number(match[2]);}return value;}
 function log(text){
  const line=String(text);logSerial++;state.logs.push({index:logSerial,text:line});if(state.logs.length>5000)state.logs.shift();
  let match=/input_host: observe ticket=(\d+) (.*)/.exec(line);
  if(match){try{const observation={ticket:Number(match[1]),...fields(match[2]),logIndex:logSerial};const required=['input','view','frame','refresh','feedback','released','fenced','guard','queued','pulse_remaining','pending','locked','touch_ready','pmu_ready','lock_guard','ready','book_open','reader_buffers','book_suspended'];if(!required.every(key=>Object.hasOwn(observation,key)))throw Error('原程序观测缺字段');state.observations.push(observation);if(state.observations.length>100)state.observations.shift();if(state.ready&&!state.stopped)emit('observation',{observation});}catch(error){failure(error);} }
  match=/input_host: complete id=(\d+) outcome=(\w+) (.*)/.exec(line);
  if(match){try{state.receipts.push({id:Number(match[1]),outcome:match[2],...fields(match[3]),logIndex:logSerial});if(state.receipts.length>100)state.receipts.shift();}catch(error){failure(error);}}
  match=/input_host: input id=(\d+)/.exec(line);if(match)state.lastInput=Number(match[1]);
  match=/P7_SHELF complete result=\d+ books=(\d+) progress_ready=(\d+)/.exec(line);if(match&&match[2]==='1')state.books=Number(match[1]);
  if(/P7_FONT status=2 /.test(line))state.fontReady=true;
  match=/web_font: status=(\d+) generation=(\d+) path=(.*)/.exec(line);if(match){state.fontStatus=Number(match[1]);state.fontPath=match[3];state.fontReady=state.fontStatus===2&&Number(match[2])>0&&state.fontPath==='/sdcard/assets/system.ttf';}
  if(/P7_FONT status=3 /.test(line))failure(Error('系统字体加载失败'),undefined,true);
  match=/P7_PREPARE (?:queued|start) generation=(\d+) view=(\d+)/.exec(line);if(match){state.prepareStart=Number(match[1]);state.prepareView=Number(match[2]);}
  match=/P7_PREPARE done generation=(\d+)/.exec(line);if(match)state.prepareDone=Number(match[1]);
  match=/p3_frame (.*)/.exec(line);if(match){try{state.readingSnapshot=fields(match[1]);const id=/book_id=(\d+)/.exec(match[1]);if(id)state.readingSnapshot.bookId=BigInt(id[1]).toString(16).padStart(16,'0');}catch(error){failure(error);}}
 }
 function frameSequence(bytes){
  if(String.fromCharCode(...bytes.subarray(0,8))!=='PLFB001\0')throw Error('原始帧格式无效');
  const view=bytes===frameHeader?frameHeaderView:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(8,true)!==WIDTH||view.getUint32(12,true)!==HEIGHT)throw Error('原始帧尺寸无效');
  return view.getUint32(16,true);
 }
 function refreshFrame(){
  if(!state.initialized||state.stopped)return false;
  let stream;
  try{
   // Native publishes by atomic rename. Retain this inode for header and pixels.
   stream=Module.FS.open('/run/frame.plfb','r');
   const read=Module.FS.read(stream,frameHeader,0,36,0);state.frameMetrics.headerReads++;state.frameMetrics.headerBytes+=read;
   if(read!==36||Module.FS.fstat(stream.fd).size!==frameLength)return false;
   let sequence=frameSequence(frameHeader);if(sequence===state.sequence)return true;
   frameBytes??=new Uint8Array(frameLength);
   const fullRead=Module.FS.read(stream,frameBytes,0,frameLength,0);state.frameMetrics.fullReads++;state.frameMetrics.fullBytes+=fullRead;
   if(fullRead!==frameLength)return false;sequence=frameSequence(frameBytes);
   if(sequence===state.sequence)return true;
   if(!frameImage){frameImage=context.createImageData(WIDTH,HEIGHT);state.frameMetrics.imageAllocations++;for(let i=3;i<frameImage.data.length;i+=4)frameImage.data[i]=255;}
   for(let i=0,j=36;i<WIDTH*HEIGHT;i++,j++){const v=frameBytes[j],at=i*4;frameImage.data[at]=v;frameImage.data[at+1]=v;frameImage.data[at+2]=v;}
   context.putImageData(frameImage,0,0);state.sequence=sequence;state.frames.push(sequence);if(state.frames.length>200)state.frames.shift();emit('frame',{sequence});return true;
  }catch(error){if(!String(error).includes('FS error')&&!String(error).includes('ErrnoError'))failure(error);return false;}
  finally{if(stream)Module.FS.close(stream);}
 }
 async function until(predicate,timeout=30000){const deadline=performance.now()+timeout;while(performance.now()<deadline){if(state.stopped)throw Error('体验已停止');if(state.error)throw Error(state.error);const value=predicate();if(value)return value;await sleep(30);}throw Error('真实运行时响应超时');}
 async function send(command){
  const ptr=Module._web_command_buffer(),deadline=performance.now()+2000;
  while(performance.now()<deadline){Module.stringToUTF8(command,ptr,512);const result=Module._web_enqueue_command();if(result===1)return;if(result<0)throw Error('运行时拒绝输入');await sleep(20);}throw Error('运行时输入队列繁忙');
 }
 function validCommand(command){
  if(typeof command!=='string'||command.length>120)throw Error('输入格式无效');
  let m=/^ARM TAP (\d+) (\d+) (\d+)$/.exec(command);
  if(m){if(+m[1]>=WIDTH||+m[2]>=HEIGHT||+m[3]<40||+m[3]>1600)throw Error('点击超出范围');return 'touch';}
  m=/^ARM SWIPE (\d+) (\d+) (\d+) (\d+) (\d+)$/.exec(command);
  if(m){if(+m[1]>=WIDTH||+m[3]>=WIDTH||+m[2]>=HEIGHT||+m[4]>=HEIGHT||+m[5]<40||+m[5]>1600)throw Error('滑动超出范围');return 'touch';}
  m=/^KEY (KEY1|KEY2|KEY3|POWER) (\d+)$/.exec(command);if(m&&+m[2]>=40&&+m[2]<=1600)return m[1]==='POWER'?'pmu':'touch';
  throw Error('不支持的原程序输入');
 }
 async function observe(kind='any',timeout=30000){
  const current=++ticket;await send('OBSERVE '+current);
  return until(()=>{refreshFrame();const o=state.observations.findLast(item=>item.ticket===current);if(!o)return null;if(o.locked===1&&kind==='touch')throw Error('屏幕已锁定，请按电源键唤醒');const idle=o.ready===1&&o.queued===0&&o.pending===0&&o.guard===0&&o.feedback===0&&o.pulse_remaining===0&&(o.locked===1?o.pmu_ready===1:o.released===1&&o.fenced===0);const eligible=kind==='any'||o[kind+'_ready']===1;return idle&&eligible&&o.frame===state.sequence?o:null;},timeout);
 }
 function currentConfiguration(){
  try{const text=new TextDecoder().decode(Module.FS.readFile('/run/settings.ini')),lines=Object.fromEntries(text.trim().split('\n').map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));const flow=Number(lines.reader_view.split(',')[3]),night=Number(lines.rstyle.split(',')[18]);state.currentConfiguration={...state.config,reading:({0:'horizontal',1:'ltr',2:'rtl'})[flow]??'UNKNOWN',night:String(night)};return state.currentConfiguration;}catch{return state.config;}
 }
 async function action(command){
  const kind=validCommand(command);await observe(kind);
  const before=logSerial,previousInput=state.lastInput;await send(command);
  const receipt=await until(()=>state.receipts.find(item=>item.logIndex>before&&item.id>previousInput));
  if(!['ACTION','NOOP','PMU_ACTION','PMU_WAKE'].includes(receipt.outcome))throw Error('原程序输入未完成：'+receipt.outcome);
  if(kind==='pmu'?receipt.pmu_consumed!==1:(receipt.down!==1||receipt.up!==1))throw Error('原程序未返回完整按下/释放收据');
  let observation=await observe();
  if(state.prepareStart>state.prepareDone&&state.prepareView===observation.view){await until(()=>state.prepareDone>=state.prepareStart||state.prepareView!==observation.view);observation=await observe();}
  refreshFrame();if(observation.frame!==state.sequence)observation=await observe();
  return {sequence:state.sequence,observation,receipt,configuration:currentConfiguration(),reading:state.readingSnapshot??null};
 }
 async function command(command,id){
  if(!state.ready)throw Error('真实体验仍在准备');if(state.busy)throw Error('上一项输入尚未完成');state.busy=true;emit('status',{id,message:'busy',sequence:state.sequence});
  try{const result=await action(command);emit('complete',{id,...result});return result;}finally{state.busy=false;}
 }
 window.addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='zhijian-command')return;const {id,command:input}=event.data;if((typeof id!=='string'&&typeof id!=='number')||String(id).length>96){failure(Error('输入编号无效'));return;}command(input,id).catch(error=>failure(error,id));});
 function pointerPosition(event){const r=canvas.getBoundingClientRect();return {x:Math.min(WIDTH-1,Math.max(0,Math.floor((event.clientX-r.left)*WIDTH/r.width))),y:Math.min(HEIGHT-1,Math.max(0,Math.floor((event.clientY-r.top)*HEIGHT/r.height)))};}
 canvas.addEventListener('pointerdown',event=>{if(!state.ready||state.busy)return;pointer={...pointerPosition(event),id:event.pointerId,time:performance.now()};canvas.setPointerCapture(event.pointerId);event.preventDefault();});
 canvas.addEventListener('pointerup',event=>{if(!pointer||event.pointerId!==pointer.id)return;const start=pointer,end=pointerPosition(event);pointer=null;const duration=Math.min(1600,Math.max(100,Math.round(performance.now()-start.time)));const input=Math.hypot(end.x-start.x,end.y-start.y)>24?`ARM SWIPE ${start.x} ${start.y} ${end.x} ${end.y} ${Math.max(200,duration)}`:`ARM TAP ${start.x} ${start.y} ${duration}`;command(input,'pointer-'+(++internalId)).catch(error=>failure(error));});
 canvas.addEventListener('pointercancel',()=>pointer=null);
 window.addEventListener('pagehide',()=>{state.stopped=true;clearInterval(frameTimer);try{Module?.PThread?.terminateAllThreads();}catch{}});
 window.addEventListener('error',event=>failure(Error(event.message||'真实运行时加载失败'),undefined,true));
 async function boot(){
  try{
   await until(()=>state.initialized,120000);
   await until(()=>state.books===3&&state.fontHashVerified===true&&state.prepareDone>=state.prepareStart&&state.prepareDone>0,120000);
   let observation=await observe('touch',60000);await until(()=>state.fontReady,30000);observation=await observe('pmu',60000);
   if(state.config.book!==null){
    await action(`ARM TAP ${130+210*Number(state.config.book)} 530 100`);
    const expected=['263213b6056f18fb','55e162cf066393b6','5a6f2af7c1481e5d'][Number(state.config.book)];
    await until(()=>state.readingSnapshot?.bookId===expected);
    observation=await observe('pmu');if(observation.view!==13||observation.book_open!==1)throw Error('原程序未进入指定书籍阅读');
   }
   refreshFrame();state.ready=true;state.error=null;emit('ready',{sequence:state.sequence,observation,configuration:currentConfiguration(),books:state.books,reading:state.readingSnapshot??null,font_sha256:'4baa9679b0aae3983a8b03c49f5cccce796b503b95e900120e8e6f3c07a6519c'});
  }catch(error){failure(error,undefined,true);}
 }
 try{
  state.config=parseConfig();if(!crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw Error('真实体验需要跨源隔离与共享内存支持');
  if(parent===window)throw Error('请从官网点击“开始体验”，以准备并校验真实程序资源');
  const bundle=parent.PaperspaceRuntimeAssets?.getBundle();if(!bundle)throw Error('真实程序资源尚未准备完成，请从官网重新开始体验');
  Module={wasmBinary:bundle.wasm,getPreloadedPackage:(name,size)=>{if(!name.endsWith('reader.data')||size!==bundle.data.byteLength)throw Error('真实程序资源包身份不符');return bundle.data;},preRun:[()=>Object.assign(Module.ENV,{PAPERLAB_MODE:'loop',PAPERLAB_SD_ROOT:'/sdcard',PAPERLAB_SETTINGS_PATH:'/run/settings.ini',PAPERLAB_NVS_PATH:'/run/nvs.bin',PAPERLAB_FRAME_PATH:'/run/frame.plfb',PAPERLAB_SPIRAM_LIMIT_MB:'8',PAPERLAB_FAKE_UNIX:'1792938300',PAPERLAB_FAKE_TIME_SYNCED:'1',PAPERLAB_SEED_EXAMPLES:'0'})],
   print:log,printErr:log,onAbort:error=>failure(Error('真实程序终止：'+error),undefined,true),onRuntimeInitialized:()=>{
    try{
     Module.FS.mkdirTree('/run');let settings=new TextDecoder().decode(Module.FS.readFile('/demo-settings.ini'));const values=Object.fromEntries(settings.trim().split('\n').map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
     const style=values.rstyle.split(',');style[1]='120';style[2]=String(Number(style[0])*2);style[18]=state.config.night;values.rstyle=style.join(',');const flow={horizontal:0,ltr:1,rtl:2}[state.config.reading];values.reader_view=`2,0,3,${flow},1,1,24`;values.lockface2=`2,1,${{soviet:0,chan:1,bauhaus:2,cat:0}[state.config.theme]},7,7`;if(state.config.theme==='cat')values.lockface4=[...Module.FS.readFile('/bootstrap/lock-cat.bin')].map(v=>v.toString(16).padStart(2,'0')).join('');else delete values.lockface4;
     Module.FS.writeFile('/run/settings.ini',Object.entries(values).map(([key,value])=>key+'='+value).join('\n')+'\n');Module.FS.writeFile('/run/nvs.bin',new Uint8Array(0));Module.FS.writeFile('/sdcard/paperspace/settings/home/current.bin',Module.FS.readFile('/bootstrap/'+(state.config.layout==='alternate'?'alternate':state.config.theme)+'.bin'));state.initialized=true;
     crypto.subtle.digest('SHA-256',Module.FS.readFile('/sdcard/assets/system.ttf')).then(digest=>{const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!=='4baa9679b0aae3983a8b03c49f5cccce796b503b95e900120e8e6f3c07a6519c')throw Error('演示字体完整性校验失败');state.fontHashVerified=true;state.fontSha256=hash;}).catch(error=>failure(error,undefined,true));
    }catch(error){failure(error,undefined,true);throw error;}
   }};
  frameTimer=setInterval(refreshFrame,100);const script=document.createElement('script');script.src='reader.js';script.onerror=()=>failure(Error('真实运行时文件加载失败'),undefined,true);document.body.append(script);boot();
 }catch(error){failure(error,undefined,true);}
})();
