'use strict';
(()=>{
 const q=s=>document.querySelector(s);const qa=s=>[...document.querySelectorAll(s)];
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 // Every transition is a recorded same-source operation. Points are source pixels.
 const steps=[
  {frame:'home',label:'主页 · 三书与日夜组件',action:{kind:'key',label:'长按左侧按键 · 返回主页'}},
  {frame:'home-chan-night',label:'切换夜间',action:{kind:'tap',x:510,y:1010,label:'轻触右下 · 日夜切换'}},
  {frame:'home-chan-day',label:'回到日间',action:{kind:'tap',x:510,y:1010,label:'再次轻触 · 回到日间'}},
  {frame:'operation-settings',label:'打开设置',action:{kind:'tap',x:598,y:1172,label:'轻触底栏 · 设置'}},
  {frame:'operation-appearance',label:'进入外观',action:{kind:'tap',x:338,y:120,label:'轻触外观设置'}},
  {frame:'widget-editor',label:'编辑主页组件',action:{kind:'tap',x:340,y:320,label:'轻触主页小组件'}},
  {frame:'widget-detail',label:'调整组件细节',action:{kind:'tap',x:170,y:210,label:'选择左上时间组件'}},
  {frame:'widget-editor',label:'返回组件列表',action:{kind:'key',label:'长按左侧按键 · 返回组件列表'}},
  {frame:'operation-appearance',label:'返回外观设置',action:{kind:'key',label:'长按左侧按键 · 返回外观设置'}},
 ];
 const hero=q('.hero-device'),heroScreen=q('.hero-device .device-screen'),heroImg=q('.hero-device .device-screen img');
 const ghost=heroImg.cloneNode();ghost.removeAttribute('src');ghost.removeAttribute('fetchpriority');ghost.className='demo-next-frame';ghost.alt='';ghost.setAttribute('aria-hidden','true');heroScreen.append(ghost);
 const touch=document.createElement('span');touch.className='demo-touch';touch.setAttribute('aria-hidden','true');heroScreen.append(touch);
 const cue=document.createElement('p');cue.className='demo-cue';cue.setAttribute('aria-live','off');q('.hero-stage').append(cue);
 let step=0,timer=null,token=0,wantsPlay=!reduced.matches,phase='idle',initialSettled=false;
 const demoEvents=[];const note=(event,details={})=>{demoEvents.push({event,at:performance.now(),step,...details});if(demoEvents.length>160)demoEvents.shift();};
 function onHome(){return !q('[data-page="home"]').hidden;}
 function eligible(){return initialSettled&&wantsPlay&&!reduced.matches&&!document.hidden&&onHome()&&!q('dialog[open]');}
 function controls(){const active=eligible();q('#demo-step').setAttribute('aria-live',active?'off':'polite');q('#demo-play').textContent=reduced.matches?'下一步操作演示 →':active?'暂停操作演示 Ⅱ':'播放操作演示 ▷';q('#demo-play').setAttribute('aria-pressed',String(active));q('#demo-play').setAttribute('aria-label',active?'暂停首页自动操作演示':reduced.matches?'手动查看下一步操作演示':'播放首页自动操作演示');}
 function clear(){token++;if(timer!==null)clearTimeout(timer);timer=null;touch.classList.remove('visible');cue.classList.remove('visible');ghost.classList.remove('incoming');hero.classList.remove('demo-key');phase='idle';controls();}
 function later(fn,ms){if(timer!==null)clearTimeout(timer);timer=setTimeout(()=>{timer=null;fn();},ms);}
 function label(){const item=steps[step];heroImg.alt=`同源真实操作步骤 ${step+1}：${item.label}`;q('.hero-zoom').dataset.enlarge=item.frame;q('.hero-zoom').setAttribute('aria-label',`放大${item.label}同源原帧`);q('#demo-step').textContent=`${String(step+1).padStart(2,'0')} / ${String(steps.length).padStart(2,'0')} · ${item.label}`;}
 function schedule(){if(reduced.matches)wantsPlay=false;controls();if(eligible())later(()=>transition((step+1)%steps.length,true),2300);}
 async function transition(target,automatic=false){
  // Recheck at the scheduled work boundary too: a browser may defer media change events.
  if(automatic&&!eligible()){if(reduced.matches)wantsPlay=false;clear();return;}
  clear();const generation=token,item=steps[target];phase='loading';
  // Decode ahead, retaining the previous complete frame on load failure.
  try{if(!await PaperspaceMedia.set(ghost,`assets/screens/${item.frame}.png`,{immediate:true}))throw Error('frame decode');}catch{if(generation!==token)return;wantsPlay=false;cue.textContent='演示画面未能加载，请完整解压后重试。';cue.classList.add('visible');phase='error';controls();note('load-error',{target});return;}
  if(generation!==token)return;
  if(automatic&&!eligible()){if(reduced.matches)wantsPlay=false;clear();return;}
  const action=target===(step+1)%steps.length?item.action:null;
  function swap(){
   if(generation!==token)return;
   if(automatic&&!eligible()){if(reduced.matches)wantsPlay=false;clear();return;}
   touch.classList.remove('visible');cue.classList.remove('visible');hero.classList.remove('demo-key');phase='transition';
   ghost.classList.add('incoming');note('frame-transition',{from:step,to:target});
   later(()=>{if(generation!==token)return;PaperspaceMedia.set(heroImg,ghost.src,{immediate:true});step=target;label();ghost.classList.remove('incoming');phase='idle';note('frame-settled',{target});schedule();},reduced.matches?0:260);
  }
  if(action){
   cue.textContent=action.label;cue.classList.add('visible');
   if(action.kind==='tap'){touch.style.left=`${action.x/684*100}%`;touch.style.top=`${action.y/1216*100}%`;touch.classList.add('visible');}
   else hero.classList.add('demo-key');
   phase='indicating';note('operation-indicator',{target,action});later(swap,reduced.matches?650:800);
  }else swap();
 }
 function pause(){wantsPlay=false;clear();note('paused');}
 q('#demo-play').addEventListener('click',()=>{if(reduced.matches){pause();transition((step+1)%steps.length);return;}if(wantsPlay){pause();return;}wantsPlay=true;clear();schedule();note('play');});
 q('#demo-prev').addEventListener('click',()=>{pause();transition((step-1+steps.length)%steps.length);});
 q('#demo-next').addEventListener('click',()=>{pause();transition((step+1)%steps.length);});
 // A direct touch hands the demonstration to its viewer and leaves the frame readable.
 heroScreen.addEventListener('pointerdown',()=>{pause();cue.textContent='已暂停 · 使用左右按钮逐步查看，或进入轻体验实际操作';cue.classList.add('visible');});
 q('.hero-zoom').addEventListener('click',pause);
 reduced.addEventListener('change',()=>{if(reduced.matches)wantsPlay=false;clear();schedule();});
 document.addEventListener('visibilitychange',()=>{clear();note(document.hidden?'hidden-pause':'visible');schedule();});
 window.addEventListener('hashchange',()=>{clear();note('route',{home:onHome()});schedule();});
 qa('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{clear();schedule();}));
 new MutationObserver(()=>{clear();schedule();}).observe(q('#image-dialog'),{attributes:true,attributeFilter:['open']});
 new MutationObserver(()=>{clear();schedule();}).observe(q('#info-dialog')||q('dialog'),{attributes:true,attributeFilter:['open']});
 window.addEventListener('pagehide',()=>{clear();note('pagehide');});
 window.addEventListener('pageshow',e=>{if(e.persisted){clear();note('bfcache-return');schedule();}});
 window.ZhijianDemo={state:()=>({step,phase,wantsPlay,playing:eligible(),timerPending:timer!==null,reduced:reduced.matches,steps:steps.map(x=>({...x})),events:[...demoEvents]})};
 label();controls();const initialGeneration=token;Promise.all([PaperspaceMedia.load(heroImg),document.fonts.ready]).catch(()=>{}).finally(()=>{initialSettled=true;note('initial-ready');if(token===initialGeneration&&phase==='idle'&&timer===null)schedule();});
 qa('[data-pair-mode]').forEach(b=>b.addEventListener('click',()=>{const mode=b.dataset.pairMode;qa('[data-pair-frame]').forEach(f=>f.hidden=f.dataset.pairFrame!==mode);qa('[data-pair-mode]').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));PaperspaceMedia.refresh();}));
 const pixelButton=q('#pixel-toggle');pixelButton.addEventListener('click',()=>{const on=!q('#image-dialog').classList.contains('pixel-view');q('#image-dialog').classList.toggle('pixel-view',on);pixelButton.setAttribute('aria-pressed',String(on));pixelButton.textContent=on?'适应窗口 ↙':'实际像素 1:1 ↗';});q('#image-dialog').addEventListener('close',()=>{q('#image-dialog').classList.remove('pixel-view');pixelButton.setAttribute('aria-pressed','false');pixelButton.textContent='实际像素 1:1 ↗';});
 let lockTheme='chan',lockNight=false,lockBook=0;
 const lockBooks=['基督山伯爵','瓦尔登湖','海底两万里'],lockThemes={chan:'禅意',soviet:'纪念碑',bauhaus:'包豪斯',cat:'猫咪'};
 const lockFrame=()=>`lock-${lockTheme}-book-${lockBook}${lockNight?'-night':''}`;
 function lockDraw(){PaperspaceMedia.set(q('#lock-shot'),`assets/screens/${lockFrame()}.png`);q('#lock-shot').alt=`${lockThemes[lockTheme]}主题 · ${lockBooks[lockBook]} · ${lockNight?'夜间':'日间'}封面锁屏同源原帧`;qa('[data-lock]').forEach(b=>{const v=b.dataset.lock===lockTheme;b.classList.toggle('selected',v);b.setAttribute('aria-pressed',String(v));});q('#lock-night').setAttribute('aria-pressed',String(lockNight));q('#lock-night').textContent=lockNight?'切换日间':'切换夜间';}
 q('#lock-book').addEventListener('change',e=>{lockBook=Number(e.target.value);lockDraw();});
 qa('[data-lock]').forEach(b=>b.addEventListener('click',()=>{lockTheme=b.dataset.lock;lockDraw()}));q('#lock-night').addEventListener('click',()=>{lockNight=!lockNight;lockDraw()});q('#lock-enlarge').addEventListener('click',()=>window.ZhijianPreview.showImage(lockFrame()));
 let progress=null;let running=false,busy=false,sequence=null,epoch=0,iframe=null,observation=null,lastReceipt=null,ready=false,error=null,bootTimer=null,books=0;
 const config={theme:'chan',night:false,reading:'horizontal',book:null};
 const screen=q('#live-touch'),host=q('#live-runtime-host'),placeholder=q('#live-placeholder'),overlay=q('#live-overlay'),status=q('#live-status'),message=q('#live-message');
 const pending=new Map(),businessWaiters=new Set();let requestId=0,progressPaint=null,identityKey=null;
 function msg(s){message.textContent=s;}
 function paint(){
  screen.setAttribute('aria-disabled',String(!running||busy));screen.setAttribute('aria-busy',String(busy));q('#live-preview').setAttribute('aria-busy',String(busy));q('.live-device').classList.toggle('running',running);q('#live-start').disabled=busy||running;
  q('#live-reset').disabled=busy&&!iframe;q('#live-stop').disabled=!iframe&&!busy;
  qa('[data-live-key]').forEach(b=>b.disabled=busy||!running);q('#live-open-demo').disabled=busy;
  q('#live-theme').disabled=busy;q('#live-reading').disabled=busy;q('#live-night').disabled=busy;
  q('#live-theme').value=config.theme;q('#live-reading').value=config.reading;q('#live-night').setAttribute('aria-pressed',String(config.night));q('#live-night').textContent=config.night?'切换日间':'切换夜间';
  status.classList.toggle('busy',busy);status.textContent=busy?(running?'正在处理真实输入':progress?.label||'正在准备浏览器程序'):running?'WASM 同源程序运行中':error?'预览已停止 · 可重试':'浏览器预览尚未启动';
  overlay.hidden=running;placeholder.hidden=running;
  if(!running){overlay.querySelector('strong').textContent=error?'预览未能启动':busy?'正在准备隔离演示卡':'实时模拟器尚未启动';overlay.querySelector('span').textContent=error||progress?.detail||'首次需加载程序与演示卡。加载完成后，每次操作都会生成当前画面。';}
  const nextIdentity=JSON.stringify([sequence,observation?.logIndex,running]);if(nextIdentity===identityKey)return;identityKey=nextIdentity;const dl=q('#live-identity');dl.replaceChildren();for(const [a,b] of [['当前帧',sequence??'—'],['源码','v2.0.8 · 79f2f5ad…56b'],['当前页面',observation?(observation.locked?'锁屏':observation.view===0?'主页':observation.view===4?'设置':observation.view===13?(observation.book_open?'阅读中':'阅读准备中'):'应用页面'):'尚未运行'],['运行方式','浏览器 WASM · 无设备连接']]){const dt=document.createElement('dt');dt.textContent=a;const dd=document.createElement('dd');dd.textContent=String(b);dl.append(dt,dd);}
 }
 function cancelPending(reason){for(const {reject,timer}of pending.values()){clearTimeout(timer);reject(Error(reason));}pending.clear();for(const wait of businessWaiters){clearTimeout(wait.timer);wait.reject(Error(reason));}businessWaiters.clear();}
 function destroy(reason){epoch++;cancelAnimationFrame(progressPaint);progressPaint=null;clearTimeout(bootTimer);bootTimer=null;cancelPending(reason);if(iframe){iframe.remove();iframe=null;}running=false;ready=false;busy=false;sequence=null;books=0;observation=null;lastReceipt=null;host.replaceChildren();paint();}
 function fail(text){destroy(text);error=text;msg(text);paint();}
 function progressText(p){
  const bytes=n=>Number(n||0).toLocaleString('zh-CN');
  const labels={download:'正在下载运行资源',decompress:'正在解压运行资源',verify:'正在校验运行资源',ready:'运行资源已校验'};
  return {label:labels[p.phase]||'正在准备运行资源',detail:p.phase==='download'?`${p.transport==='gzip'?'压缩下载':'下载'}：${bytes(p.received)} / ${bytes(p.total)} 字节` :p.phase==='decompress'?'正在解压已下载的程序与演示卡。':p.phase==='verify'?'正在核对程序与演示卡 SHA-256。':'正在初始化同源程序与隔离演示卡。'};
 }
 const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 async function start(note='正在启动同源程序，请稍候。'){
  destroy('体验已重新启动。');error=null;progress=null;
  if(location.protocol==='file:'){fail('请完整解压并双击“启动纸间预览.command”。直接打开 HTML 无法运行线程模拟器。');return;}
  if(!crossOriginIsolated||typeof SharedArrayBuffer==='undefined'){fail('当前服务缺少跨源隔离。请使用包内启动器，它会提供 COOP/COEP；无需编译或访问私有仓库。');return;}
  busy=true;msg(note);paint();const generation=epoch;
  await nextPaint();if(generation!==epoch)return;
  try{
   if(!window.PaperspaceRuntimeAssets)throw Error('运行资源加载器缺失，请刷新重试。');
   await PaperspaceRuntimeAssets.prepare({onProgress:p=>{if(generation!==epoch)return;progress=progressText(p);if(progressPaint===null)progressPaint=requestAnimationFrame(()=>{progressPaint=null;if(generation===epoch)paint();});}});
   if(generation!==epoch)return;
  }catch(e){if(generation===epoch)fail('运行资源未能准备：'+e.message);return;}
  progress={label:'正在初始化同源程序',detail:'运行资源已校验。正在初始化同源程序与隔离演示卡。'};paint();
  await nextPaint();if(generation!==epoch)return;
  iframe=document.createElement('iframe');iframe.id='live-frame';iframe.title='纸间 v2.0.8 同源实时画面';iframe.setAttribute('aria-hidden','true');iframe.tabIndex=-1;
  const args=new URLSearchParams({theme:config.theme,night:config.night?'1':'0',reading:config.reading});if(config.book!==null)args.set('book',String(config.book));
  iframe.src='runtime/index.html?'+args;iframe.onload=()=>{if(generation===epoch&&!iframe?.contentDocument?.querySelector('canvas'))fail('运行文件缺失。请完整解压 ZIP，然后重新启动预览。');};iframe.onerror=()=>{if(generation===epoch)fail('浏览器程序加载失败。请确认完整解压后重新启动预览。');};host.append(iframe);
  // Resource download has its own bounded network lifetime. This timeout starts only after verification.
  bootTimer=setTimeout(()=>{if(generation===epoch&&!ready)fail('程序初始化超时。可停止后重新启动；没有连接设备。');},90000);
 }
 window.addEventListener('message',e=>{
  if(!iframe||e.source!==iframe.contentWindow||e.origin!==location.origin)return;const data=e.data;if(!data||data.type!=='zhijian-runtime')return;
  if(data.configuration?.night==='0'||data.configuration?.night==='1')config.night=data.configuration.night==='1';
  if(data.books!=null)books=data.books;if(Number.isSafeInteger(data.sequence)&&(sequence===null||data.sequence>=sequence))sequence=data.sequence;
  // C may finish opening a book after its input receipt; never regress a newer observation.
  if(Number.isSafeInteger(data.observation?.logIndex)&&(!observation||data.observation.logIndex>=observation.logIndex))observation=data.observation;if(data.receipt)lastReceipt=data.receipt;
  if(data.event==='ready'){clearTimeout(bootTimer);ready=true;running=true;busy=false;error=null;msg(config.book!==null?'已打开短演示书。可翻页、返回或体验锁屏。':'同源程序已就绪。试试点击三本封面、打开设置，或调整主页组件。');}
  if(data.event==='complete'||data.event==='error'){
   const waiting=pending.get(data.id);if(waiting){clearTimeout(waiting.timer);pending.delete(data.id);if(data.event==='error')waiting.reject(Error(data.message||'同源输入未完成。'));else waiting.resolve(data);}
   else if(data.event==='error'){fail(data.message||'浏览器运行时停止，请重新启动。');return;}
  }
  for(const wait of [...businessWaiters])wait.check();paint();
 });
 function waitForBook(generation,bookId){
  return new Promise((resolve,reject)=>{
   const wait={reject,timer:null,check(){
    if(generation!==epoch)return;
    if(observation?.view!==13||observation.book_open!==1||sequence!==observation.frame)return;
    const native=iframe?.contentWindow?.ZhijianRuntime?.readState();
    if(native?.sequence!==sequence||native.readingSnapshot?.bookId!==bookId)return;
    clearTimeout(wait.timer);businessWaiters.delete(wait);resolve();
   }};
   wait.timer=setTimeout(()=>{businessWaiters.delete(wait);reject(Error('短书画面尚未就绪，可重试或停止模拟器。'));},30000);
   businessWaiters.add(wait);wait.check();
  });
 }
 async function input(command,{bookId=null}={}){
  if(busy){msg('正在处理上一项操作，请稍候。');return;}if(!running||!iframe)return;busy=true;const generation=epoch;msg('正在处理真实输入，等待程序生成当前画面。');paint();await nextPaint();if(generation!==epoch)return;
  try{const id=++requestId;const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('输入等待超时。可停止后重新启动体验。'));},30000);pending.set(id,{resolve,reject,timer});iframe.contentWindow.postMessage({type:'zhijian-command',id,command},location.origin);});if(generation!==epoch)return;lastReceipt=result.receipt||lastReceipt;const outcome=result.receipt?.outcome;if(bookId&&outcome!=='NOOP'){msg('输入已受理，正在等待短书的真实阅读画面。');await waitForBook(generation,bookId);if(generation!==epoch)return;msg('短演示书已打开，当前阅读画面已呈现。');}else msg(outcome==='NOOP'?'当前操作没有改变页面。':outcome==='EXPIRED_UNSAMPLED'?'这次触摸未被页面采样，请重试。':'输入已由同源程序处理。');}
  catch(e){if(generation===epoch)msg(e.message);}
  finally{if(generation===epoch){busy=false;paint();}}
 }
 q('#live-start').addEventListener('click',()=>start());q('#live-stop').addEventListener('click',()=>{window.PaperspaceRuntimeAssets?.cancel();destroy('模拟器已停止。');progress=null;error=null;msg('模拟器已停止；浏览器线程与隔离演示卡一并释放。');paint();});
 q('#live-reset').addEventListener('click',()=>{Object.assign(config,{theme:'chan',night:false,reading:'horizontal',book:null});start('正在恢复三本短书与默认展示配置。');});
 q('#live-theme').addEventListener('change',e=>{config.theme=e.target.value;config.book=null;start('正在载入所选主页风格，重新启动隔离演示。');});
 q('#live-night').addEventListener('click',()=>{config.night=!config.night;config.book=null;start('正在由同源程序载入日夜显示配置。');});
 q('#live-reading').addEventListener('change',e=>{config.reading=e.target.value;config.book=0;start('正在按所选方向打开《基督山伯爵》短演示书。');});
 q('#live-open-demo').addEventListener('click',()=>{config.book=0;if(running&&!busy&&observation?.view===0&&!observation.locked){input('ARM TAP 130 530 100',{bookId:'263213b6056f18fb'});return;}start('正在打开《基督山伯爵》短演示书。');});
 qa('[data-live-key]').forEach(b=>b.addEventListener('click',()=>input(`KEY ${b.dataset.liveKey} ${Number(b.dataset.liveDuration||100)}`)));
 function point(e){const r=screen.getBoundingClientRect();const border=screen.clientLeft;return {x:Math.max(0,Math.min(683,Math.round((e.clientX-r.left-border)*684/(r.width-border*2)))),y:Math.max(0,Math.min(1215,Math.round((e.clientY-r.top-border)*1216/(r.height-border*2))))};}
 const liveTouch=document.createElement('span');liveTouch.className='live-touch-feedback';liveTouch.setAttribute('aria-hidden','true');screen.append(liveTouch);let touchTimer=null;function feedback(p){clearTimeout(touchTimer);liveTouch.style.left=`${p.x/684*100}%`;liveTouch.style.top=`${p.y/1216*100}%`;liveTouch.classList.add('visible');touchTimer=setTimeout(()=>liveTouch.classList.remove('visible'),650);}
 let pointer=null;screen.addEventListener('pointerdown',e=>{if(busy){msg('正在处理上一项操作，请稍候。');return;}if(!running||e.button!==0)return;feedback(point(e));pointer={...point(e),id:e.pointerId,time:performance.now()};screen.setPointerCapture(e.pointerId);e.preventDefault();screen.focus({preventScroll:true});});screen.addEventListener('pointercancel',()=>pointer=null);screen.addEventListener('lostpointercapture',()=>pointer=null);
 screen.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const from=pointer;pointer=null;const to=point(e),duration=Math.max(100,Math.min(1400,Math.round(performance.now()-from.time)));input(Math.hypot(to.x-from.x,to.y-from.y)>30?`ARM SWIPE ${from.x} ${from.y} ${to.x} ${to.y} ${Math.max(250,duration)}`:`ARM TAP ${to.x} ${to.y} ${duration}`);});
 screen.addEventListener('keydown',e=>{const map={ArrowLeft:['KEY1',100],ArrowRight:['KEY2',100],Escape:['KEY1',800],Home:['KEY3',800]};if(!map[e.key]||!running||busy)return;e.preventDefault();e.stopPropagation();const [key,duration]=map[e.key];input(`KEY ${key} ${duration}`);});
 window.addEventListener('hashchange',()=>{if(location.hash!=='#experience'&&(iframe||busy)){window.PaperspaceRuntimeAssets?.cancel();destroy('离开体验页，模拟器已停止。');error=null;msg('返回后可重新启动浏览器体验。');paint();}});window.addEventListener('pagehide',()=>{window.PaperspaceRuntimeAssets?.cancel();clearTimeout(touchTimer);destroy('页面已关闭。');});paint();
 window.ZhijianLive={state:()=>({running,busy,sequence,connected:!!iframe,ready,error,books,progress,epoch,config:{...config},observation,lastReceipt,engine:'wasm'}),refresh:()=>paint()};
})();
