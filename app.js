'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const scenes = [
 ['home','主页','时间、日历、最近阅读与日常工具，按自己的节奏排列。'],
 ['home-soviet','纪念碑点缀','新生成雕塑与建筑装饰，经真实组件配置渲染。'],
 ['home-chan','禅意点缀','本次新生成雅致佛像轮廓，留白与三书封面同屏。'],
 ['home-cat','可爱猫咪','新增原创猫咪，经真实组件和可选锁屏配置渲染。'],
 ['home-bauhaus','包豪斯点缀','本次重新设计的几何秩序，经实际 native 渲染。'],
 ['home-alternate','另一种排布','同一组主页组件，调整卡片顺序与宽高。'],
 ['home-chan-night','夜间主页','由 native 系统实际生成的夜间映射，非网页滤镜。'],
 ['widget-editor','组件编辑','实际固件编辑入口，区分草稿、预览与应用。'],
 ['icon-editor','图标编辑','实际点阵编辑界面；此网页不保存固件配置。'],
 ['app-center','应用中心','实际应用中心。展示的是自有示例，不是在线商店。'],
 ['lock-soviet','纪念碑锁屏','同源固件真实锁屏输入后的原帧。'],
 ['lock-chan','禅意锁屏','同源固件真实锁屏输入后的原帧。'],
 ['lock-bauhaus','包豪斯锁屏','同源固件真实锁屏输入后的原帧。'],
 ['reading-horizontal','横排与注释','自写短情境简述与页内注释，由同源 EPUB 阅读器渲染。'],
 ['reading-vertical-rtl','竖排 · 右至左','同一短演示书，原生从右到左竖排。'],
 ['reading-vertical-ltr','竖排 · 左至右','同一短演示书，原生从左到右竖排。']
];
let currentScene=0,requestedScene=0;let currentReading='reading-horizontal';
const sceneList=$('#scene-list');
scenes.forEach(([id,title],i)=>{const b=document.createElement('button');b.textContent=title;b.dataset.scene=i;b.setAttribute('aria-pressed',i===0?'true':'false');b.addEventListener('click',()=>setScene(i));sceneList.append(b);});
function setScene(i){requestedScene=(i+scenes.length)%scenes.length;const target=requestedScene,[id,title,description]=scenes[target];PaperspaceMedia.set($('#experience-shot'),`assets/screens/${id}.png`,{alt:title+' · 2.0.8 同源渲染',onReady:()=>{currentScene=target;$('#scene-title').textContent=title;$('#scene-description').textContent=description;$('#scene-caption').textContent=`${String(currentScene+1).padStart(2,'0')} / ${scenes.length} — ${title} · 静态场景回放`;$$('[data-scene]').forEach((b,j)=>b.setAttribute('aria-pressed',j===currentScene?'true':'false'));}});}
setScene(0);
$('#prev-scene').addEventListener('click',()=>setScene(requestedScene-1));$('#next-scene').addEventListener('click',()=>setScene(requestedScene+1));$('#home-scene').addEventListener('click',()=>setScene(0));$('#reset-scene').addEventListener('click',()=>setScene(0));
function route(){const requested=location.hash.slice(1)||'home';if(requested==='main'){$('#main').focus();return;}const page=['home','experience','guide','flash'].includes(requested)?requested:'home';$$('[data-page]').forEach(p=>p.hidden=p.dataset.page!==page);$$('nav a,header>.install-nav').forEach(a=>{if(a.hash==='#'+page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});document.title=page==='home'?'纸间 · 指间方寸，纸间万千。':`纸间 paperspace · ${{experience:'轻体验',guide:'使用与开发',flash:'下载与刷机'}[page]}`;if(requested==='customize')requestAnimationFrame(()=>$('#customize')?.scrollIntoView());else window.scrollTo(0,0);PaperspaceMedia.refresh();}
window.addEventListener('hashchange',route);route();
window.ZhijianPreview={showImage};
$('.skip').addEventListener('click',e=>{e.preventDefault();$('#main').focus();$('#main').scrollIntoView();});
$$('[data-reading]').forEach(b=>b.addEventListener('click',()=>{const target=b.dataset.reading;PaperspaceMedia.set($('#reading-shot'),`assets/screens/${target}.png`,{alt:b.childNodes[0].textContent.trim()+'与页内注释的同源渲染',onReady:()=>{currentReading=target;$$('[data-reading]').forEach(c=>{c.classList.toggle('selected',c===b);c.setAttribute('aria-pressed',c===b?'true':'false');});}});}));
const info=$('#info-dialog');const imageDialog=$('#image-dialog');
function showImage(id){const shot=$('#enlarged-image');imageDialog.showModal();PaperspaceMedia.set(shot,`assets/screens/${id}.png`,{immediate:true});}
$$('[data-enlarge]').forEach(b=>b.addEventListener('click',()=>showImage(b.dataset.enlarge==='reading'?currentReading:b.dataset.enlarge)));
$('#experience-enlarge').addEventListener('click',()=>showImage(scenes[currentScene][0]));
$$('dialog .close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$$('dialog').forEach(d=>{d.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const focusable=[...d.querySelectorAll('button,textarea,a[href],input,[tabindex]')].filter(n=>!n.disabled&&n.getClientRects().length);const first=focusable[0],last=focusable[focusable.length-1];if(!first)return;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();});});
const aiPrompt=`请为纸间 paperspace v2.0.8 自有轻应用开发“[用途]”，界面用简体中文。\n基线提交：79f2f5ad303b9a588d551e3e0eb4b6e5735bc56b。\n先读 docs/lightapp-ai-quickstart.md、lightapp-package-format.md，再核 firmware/read_pico_firmware/main/lightapp/lightapp.h 与同目录 lightapp.c。\n参考 firmware/read_pico_firmware/examples/lightapps/gomoku 或 zen_clock，按 host.width/height 布局，不假设像素尺寸。\n先给出一屏用途、触摸热区和自身单个 int32 持久值含义，再实现 manifest.json、main.lua 与可选图标。\n按实际能力选择 API，显式列出 permissions.required / optional。reading.read 从 API3 起；notes.write / tasks.write / focus.control 从 API4 起；HTML 用 API5 的 html.render；host.browser_open 另需 network 且只在 on_open 调用。读 lightapp-browser-api.md。\n网络仅有界异步 GET；无后台、任意文件、正文修改、POST、自定义请求头或通用 Lua 库。保存 true 后才更新成功状态。\n普通文本单条95 UTF-8字节，每快照32绘图命令；遵守源码、堆与回调预算，不用忙循环或动画计时。\n先打包 --inspect，再测试运行及失败恢复。若能力不够，明确缺口，不虚构 API。\n交付源目录、.elapp、SHA256、说明与已执行/未执行验证。此任务不授权刷机或发布。`;
const modals={
 download:['下载与刷机',`<p>仅连接官网指定的 Read Pico 机型。USB 安装会自动获取并校验官网固定固件，无需下载或选择 ZIP；SD 资源可独立下载。刷机流程为：连接设备 → 确认一次风险 → 开始刷入。</p><p>可信双槽可保留数据更新；其他设备可选择全新安装，清空全部 16 MiB 内部数据，包括设置、阅读进度和文件。TF/SD 卡不改动，完整备份可选。未知旧布局不能据此保证保留数据。</p><p>本构建尚未完成真机验证。请保持供电与 USB 连接；断电、取消或失败可能需要重新进入下载模式重装，网页无自动回滚。写入与读回校验完成不代表实际启动、显示或硬件验收通过。</p>`],
 simulation:['轻体验的范围',`<p>实时操作区在浏览器内运行 v2.0.8 同源 WASM 程序，触控与按键进入原输入链，显示当前灰阶帧。首页操作演示与折叠原帧导览使用预先采集的画面，已明确区分。运行文件的许可、版权通知与对应重链接材料可在“许可与鸣谢”页查看。</p><p>外壳为按照片几何观察制作的 CSS 示意，屏幕采用真实 684:1216 比例。浏览器适配可以接受模拟触摸输入，但不能证明真实墨水屏光学、残影、实体触控、刷新时间、联网或功耗。</p><p>主页与阅读内容均为隔离演示数据。不会读取你本机的设备、书籍或账户。</p>`],
 ai:['给 AI 一份清楚的任务',`<p>这段提示绑定实际标签，供你接入代码工作流。它不会在本网站执行或上传。</p><textarea id="copy-text" aria-label="AI 开发任务提示" readonly></textarea><button class="button" id="copy-action">复制提示 ↗</button><p class="copy-status" aria-live="polite"></p>`]
};
$$('[data-modal]').forEach(b=>b.addEventListener('click',()=>{const key=b.dataset.modal;const [title,content]=modals[key];$('#dialog-title').textContent=title;$('#dialog-content').innerHTML=content;if(key==='ai')$('#copy-text').value=aiPrompt;const copy=$('#copy-action');if(copy){const field=$('#copy-text'),status=$('.copy-status');copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(field.value);if(status.isConnected&&info.open)status.textContent='已复制到剪贴板。';}catch{if(field.isConnected&&info.open){field.focus();field.select();status.textContent='浏览器限制了复制，请长按或使用 Ctrl/Cmd + C 复制已选文字。';}}});}info.showModal();}));
window.addEventListener('keydown',e=>{if(location.hash!=='#experience'||!$('.scene-guide').open||info.open||imageDialog.open||['TEXTAREA','INPUT'].includes(document.activeElement.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();setScene(requestedScene+1);}if(e.key==='ArrowLeft'){e.preventDefault();setScene(requestedScene-1);}});
function imageState(img,failed){let msg=img.parentElement.querySelector(':scope > .image-error');if(failed&&!msg){msg=document.createElement('span');msg.className='image-error';msg.textContent='画面加载失败，请检查网络连接并重试。';img.parentElement.append(msg);}const retained=failed&&img.naturalWidth>0;if(msg){msg.hidden=!failed;msg.textContent=retained?'新画面未能加载，保留上一张完整原帧。请检查网络后重试。':'画面加载失败，请检查网络连接并重试。';}img.parentElement.classList.toggle('image-failed',failed&&!retained);img.parentElement.classList.toggle('image-retained',retained);}
$$('img').forEach(img=>{img.addEventListener('error',()=>imageState(img,true));img.addEventListener('mediaerror',()=>imageState(img,true));img.addEventListener('mediaready',()=>imageState(img,false));img.addEventListener('load',()=>imageState(img,false));if(img.getAttribute('src')&&img.complete&&img.naturalWidth===0)imageState(img,true);});
