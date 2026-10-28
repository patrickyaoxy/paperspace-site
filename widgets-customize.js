// All device pixels in this module come from the v2.1.1 stable native framebuffer.
// CSS draws only the website shell and the recorded-input indicator.
const asset=name=>`assets/customize-stable/${name}.png`;
const presets=[
 {name:'阅读优先',frame:'preset-reading-home-settled',tag:'BOOKS FIRST',description:'让最近阅读占据上半屏。时间与日程退到第二层，三张日常卡片收住一屏。',order:'整行展开的最近阅读 → 半行时间与日程 → 三分之一宽的专注、待办、随手记。',gray:'书架15、时间1、日程14，底层三卡13／15／11。前景由固件按背景自动选择。',balance:'大阅读区与规整小卡配重。实际组件保留自己的字号、信息和点阵笔刷。'},
 {name:'均衡网格',frame:'preset-balanced-home-settled',tag:'A QUIET GRID',description:'时间与日程、阅读与快捷入口成对安排，整行统计落在底部。',order:'两张半行标准卡 → 三张紧凑卡 → 阅读与快捷入口 → 整行柱状统计。',gray:'时间0、快捷入口3；其余卡片12／13／15。深色在上下错位呼应。',balance:'相同尺寸成组，大小交替；只按固件的三档宽度与高度组织信息。'},
 {name:'大小拼接',frame:'preset-mosaic-home-settled',tag:'RHYTHM IN SCALE',description:'高时间卡与短卡错落拼接。下接整行书架，最后由半行双卡收束。',order:'三分之一宽的展开、紧凑与标准卡拼接 → 整行书架 → 文字统计与快捷入口。',gray:'时间1、快捷入口3；其余11／12／13／15。半行统计保持文字模式。',balance:'变化的是高度，稳定的是六列网格。所有卡片由实际固件自动排布。'},
 {name:'横向分层',frame:'preset-layers-home-settled',tag:'ONE ROW, ONE THOUGHT',description:'把一屏分成五个段落：时间、阅读、专注、待办与统计，视线自然向下。',order:'整行紧凑时间 → 标准书架 → 紧凑专注与待办 → 标准柱状统计。',gray:'时间2、专注12、统计14，书架与待办15。用灰阶分层，保持一致边界。',balance:'每层只承担一件事。完整保留固件实际的信息密度与组件几何。'},
 {name:'深浅对照',frame:'preset-contrast-home-settled',tag:'CONTRAST, WITH INTENT',description:'深色留给时间和专注，浅色留给阅读与日程，让主次先被看见。',order:'半行时间／日程 → 半行展开阅读／专注 → 三张三分之一标准卡。',gray:'时间0、专注2、快捷入口1；随手记12，其他15。实际文字由固件自动对比。',balance:'深色错位排列，浅底阅读区缓和墨色重量；所有尺寸均通过真实配置校验。'}
];
const step=(frame,label,action,tip,spot)=>({frame,label,action,tip,spot});
const tutorials={widgets:[
 step('factory-home','打开设置','点底部「设置」','从实际首页的底部导航进入设置。',[513,1128,171,88]),
 step('settings-reading','外观标签','点顶部「外观」','阅读、外观、设备是顶部横排标签，不是新的菜单页。',[240,84,196,72]),
 step('settings-appearance','主页小组件','点「主页小组件」','进入真实的组件列表和主页预览入口。',[32,244,620,139]),
 step('widgets-list','选择组件','点时间组件标题区','本例编辑第一张 PAPER / TODAY 卡。列表还提供上移、下移、删除。',[44,180,280,84]),
 step('widget-layout','调整宽度','点宽度「−」','详情上方是真实卡片预览；下方布局页通过加减按钮选择尺寸。',[190,615,146,72]),
 step('widget-width-third','恢复半行','点宽度「＋」','刚才已从半行切为三分之一。本例再恢复半行，继续演示高度。',[506,615,146,72]),
 step('widget-width-half','调整高度','点高度「＋」','标准高度切换为展开；固件会重新计算页面容量。',[506,699,146,72]),
 step('widget-height-expanded','恢复标准','点高度「−」','本例恢复标准高度，让最终首屏保留原来的完整排列。',[190,699,146,72]),
 step('widget-height-standard','进入外观','点「外观」标签','布局、内容、外观都在组件详情中，预览保持在页面上方。',[453,531,199,72]),
 step('widget-appearance','选择灰阶模式','点「16灰阶」','实际界面提供白底黑字、黑底白字、16灰阶与背景点缀四个入口。',[348,615,146,72]),
 step('widget-gray-grid','选择灰阶1','点色块「1」','这是实际的4×4背景灰阶色板，文字前景由固件自动选择黑或白。',[190,699,146,72]),
 step('widget-gray-one','检查整页','点「整体预览」','当前只改变时间卡的背景灰阶。先看完整主页，再应用更改。',[348,1128,146,72]),
 step('widget-full-preview','返回详情','点「返回上级」','整体预览不会自动应用；返回组件详情继续确认。',[32,1128,620,72]),
 step('widget-return-from-preview','应用更改','点「应用更改」','应用成功后仍留在组件详情，不会自动跳到首页。',[506,1128,146,72]),
 step('widget-applied-stays-detail','返回列表','点「返回上级」','同源帧保留真实的“主页已保存并应用”状态，然后逐级返回。',[32,1128,146,72]),
 step('widgets-list-applied','返回设置','点「返回上级」','从组件列表返回设置的外观标签。',[32,1128,146,72]),
 step('widgets-back-to-appearance','回到首页','点底部「主页」','通过真实底部导航回到主页，检查应用后的整屏。',[0,1128,171,88]),
 step('widget-final-home','完整首页',null,'尺寸演示后恢复原布局；时间卡的灰阶1已真正保存并应用。',null)
],icons:[
 step('widget-final-home','打开设置','点底部「设置」','独立演示从实际首页开始，不会替网页访问者修改设备。',[513,1128,171,88]),
 step('icons-settings','进入图标编辑','点「图标编辑」','本次设置页保留在外观标签，直接进入图标编辑入口。',[32,539,620,139]),
 step('icons-list','选择设置图标','点「设置」图标组','真实列表每行四组，分别显示常态和激活态。本例选“设置”。',[348,319,146,184]),
 step('icon-edit-default','点按一格','点第5行、第6列','原生11×11网格。只切换常态的一格，保留其余图案。',[318,534,48,48]),
 step('icon-edited','检查激活态','点「激活态」','两态分别编辑。本例没有改动激活态，不会把常态修改自动同步过去。',[348,196,304,72]),
 step('icon-active-checked','回看常态','点「常态」','确认激活态仍保持原样，再回到修改后的常态。',[32,196,304,72]),
 step('icon-default-checked','应用整套','点「应用整套」','真正的应用按钮在编辑操作行的右侧三分之一。',[453,950,199,72]),
 step('icon-applied-stays-editor','返回图标列表','点「返回上级」','保存成功仍留在编辑器，必须另行返回，不能直接跳首页。',[32,1128,198,72]),
 step('icon-list-after','返回设置','点「返回上级」','列表显示已应用的常态与激活态。图标预设入口也在列表底部。',[32,1128,198,72]),
 step('icon-settings-back','回到首页','点底部「主页」','从外观设置的底部导航回到主页。',[0,1128,171,88]),
 step('icon-final-home','完整首页',null,'首页底部“设置”图标使用已编辑的常态。用「放大原帧」按钮检查；设备实际状态以保存结果为准。',null)
]};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mount(root){
 const host=root.querySelector('#customize-studio');if(!host||host.dataset.mounted)return;host.dataset.mounted='true';
 host.innerHTML=`<div class="studio"><div class="studio-toolbar"><div class="studio-tabs" role="group" aria-label="选择自定义演示"><button data-studio-mode="presets" aria-pressed="true">五种搭配</button><button data-studio-mode="widgets" aria-pressed="false">小组件怎么配</button><button data-studio-mode="icons" aria-pressed="false">图标怎么改</button></div><span class="studio-kicker">v2.1.1 STABLE / NATIVE FRAMES</span></div><div class="studio-body"><div class="studio-stage"><div class="studio-device"><div class="studio-screen"><img class="studio-frame" width="684" height="1216" alt="v2.1.1 stable同源原帧，正在加载" hidden><p class="studio-frame-placeholder">正在加载同源原帧…</p></div><div class="hardware" aria-hidden="true"><span>−</span><span>○</span><span>−</span></div></div><p class="studio-stage-note">v2.1.1 stable 同源模拟器截图 · 非实机<br>设备像素来自固件输出，回放节奏不代表墨水屏刷新速度</p></div><div class="studio-panel"><p class="studio-index"></p><h3></h3><p class="studio-description"></p><div class="preset-list" role="group" aria-label="五种完整首屏搭配"></div><ol class="studio-step-list" aria-label="实际设备操作步骤" hidden></ol><dl class="studio-principles"></dl><div class="studio-controls"><button class="studio-primary" data-studio-action="next">下一个搭配 →</button><button data-studio-action="prev">← 上一个</button><button data-studio-action="play" aria-pressed="false">播放搭配 ▶</button><button data-studio-action="reset" hidden>从头演示 ↺</button><button data-studio-action="zoom">放大原帧 ↗</button></div><p class="studio-status" role="status" aria-live="polite"></p><p class="studio-motion-note" hidden>已遵循减少动态效果偏好。使用「下一步」逐项查看。</p><div class="studio-compare"><p class="studio-compare-label"></p><div class="studio-compare-pair"></div></div></div></div><p class="studio-footnote">五套布局均经 v2.1.1 stable 配置校验及实际预设载入、应用后录制；它们是官网搭配示例，不是固件内置主题。教程按真实输入顺序回放，含预览、应用及返回路径。字体、短书与书封为隔离演示资源，网页不连接或写入设备。<a href="assets/customize-stable/provenance.json">查看帧来源与校验记录 ↗</a></p></div><dialog class="studio-lightbox" aria-label="v2.1.1 stable同源原帧放大"><button class="close" aria-label="关闭同源原帧">×</button><p>v2.1.1 stable 同源模拟器截图 · 非实机 · Esc关闭</p><div tabindex="0" class="studio-lightbox-scroll"><img width="684" height="1216" alt="放大的v2.1.1 stable原始固件帧"></div></dialog>`;
 const q=s=>host.querySelector(s),qa=s=>[...host.querySelectorAll(s)],screen=q('.studio-screen'),img=q('.studio-frame'),status=q('.studio-status'),reduced=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width:650px)');
 let mode='presets',preset=0,stepIndex=0,wantsPlay=false,timer=null,generation=0,phase='loading',near=false,disposed=false,pending=null,currentFrame=null,lightboxFocus=null;
 const active=()=>!disposed&&!document.hidden&&!root.closest('[hidden]')&&!document.querySelector('dialog[open]')&&near;
 const last=()=>mode==='presets'?4:tutorials[mode].length-1;
 const stopPending=()=>{generation++;clearTimeout(timer);timer=null;pending=null;phase='idle';screen.removeAttribute('aria-busy');screen.querySelector('.studio-hotspot')?.classList.remove('indicating');qa('[data-preset]').forEach(b=>b.removeAttribute('aria-busy'));};
 const tell=s=>status.textContent=s;
 function controls(){const playing=wantsPlay&&active()&&!reduced.matches;q('[data-studio-action="play"]').setAttribute('aria-pressed',String(playing));q('[data-studio-action="play"]').textContent=playing?'暂停 Ⅱ':mode==='presets'?'播放搭配 ▶':'播放步骤 ▶';q('[data-studio-action="play"]').disabled=reduced.matches;q('.studio-motion-note').hidden=!reduced.matches;}
 function schedule(){controls();if(!wantsPlay||!active()||reduced.matches||timer!==null||phase!=='idle')return;if(mode!=='presets'&&stepIndex===last()){wantsPlay=false;controls();return;}timer=setTimeout(()=>{timer=null;advance(1,true);},mode==='presets'?4200:3000);}
 function placeControls(){const list=q('.preset-list'),buttons=q('.studio-controls'),message=q('.studio-status'),motion=q('.studio-motion-note');if(mobile.matches){q('.studio-toolbar').append(list);const stage=q('.studio-stage'),note=q('.studio-stage-note');for(const n of[buttons,message,motion])stage.insertBefore(n,note);}else{const panel=q('.studio-panel');panel.insertBefore(list,q('.studio-step-list'));for(const n of[buttons,message,motion])panel.insertBefore(n,q('.studio-compare'));}}
 function thumb(frame,alt){return `<img src="${asset(frame)}" width="684" height="1216" loading="lazy" decoding="async" alt="${esc(alt)}">`;}
 function showFrame(frame){lightboxFocus=document.activeElement;const dialog=q('.studio-lightbox');q('.studio-lightbox img').src=asset(frame);dialog.showModal();}
 function draw(){
  const p=presets[preset],item=mode==='presets'?null:tutorials[mode][stepIndex],focus=screen.contains(document.activeElement);
  qa('[data-studio-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.studioMode===mode)));q('.preset-list').hidden=mode!=='presets';q('.studio-step-list').hidden=mode==='presets';q('[data-studio-action="reset"]').hidden=mode==='presets';q('[data-studio-action="prev"]').disabled=mode!=='presets'&&stepIndex===0;
  q('[data-studio-action="next"]').textContent=mode==='presets'?'下一个搭配 →':stepIndex===last()?'重新演示 ↺':'演示点击 · 下一步 →';q('[data-studio-action="zoom"]').disabled=!currentFrame;
  q('.studio-index').textContent=mode==='presets'?`${String(preset+1).padStart(2,'0')} / 05 · ${p.tag}`:`${mode==='widgets'?'WIDGETS':'ICONS'} / ${stepIndex+1} — ${last()+1}`;
  q('h3').textContent=mode==='presets'?p.name:item.label;q('.studio-description').textContent=mode==='presets'?p.description:item.tip;
  const facts=mode==='presets'?[['排布',p.order],['灰阶',p.gray],['平衡',p.balance]]:[['路径',mode==='widgets'?'设置 → 外观 → 主页小组件':'设置 → 外观 → 图标编辑'],['当前',item.action||'检查已应用的完整首页'],['来源','v2.1.1 stable native 原始帧；网页点击指示叠加于图片上方。']];q('.studio-principles').innerHTML=facts.map(([a,b])=>`<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('');
  screen.querySelector('.studio-hotspot')?.remove();if(item?.spot){const[x,y,w,h]=item.spot,b=document.createElement('button');b.className='studio-hotspot';b.style.cssText=`left:${x/684*100}%;top:${y/1216*100}%;width:${w/684*100}%;height:${h/1216*100}%`;b.setAttribute('aria-label','演示'+item.action);b.addEventListener('click',()=>advance(1));screen.append(b);}if(focus)(screen.querySelector('.studio-hotspot')||q('[data-studio-action="next"]')).focus({preventScroll:true});
  qa('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.preset)===preset)));
  q('.studio-step-list').innerHTML=(tutorials[mode]||[]).map((s,i)=>`<li ${i===stepIndex?'aria-current="step"':''}>${i+1}. ${esc(s.label)}</li>`).join('');
  const compare=mode==='icons'?[['icon-edit-default','修改前','常态原始网格'],['icon-default-checked','修改后','常态只改变一格']]:mode==='widgets'?[['factory-home','应用前','原始完整首页'],['widget-final-home','应用后','时间卡灰阶1']]:[['preset-balanced-home-settled','参考搭配','均衡网格'],[p.frame,'所选搭配',p.name]];
  q('.studio-compare-label').textContent=mode==='icons'?'原生网格前后比较 · 点击放大核对':mode==='widgets'?'实际应用前后 · 完整首页':'完整首屏比较 · 点击查看同源原帧';q('.studio-compare-pair').innerHTML=compare.map(([frame,a,b])=>`<figure><button class="studio-compare-button" data-compare-frame="${frame}" aria-label="放大${esc(a+b)}同源原帧">${thumb(frame,a+b+'同源原帧')}</button><figcaption>${esc(a)}<br>${esc(b)}</figcaption></figure>`).join('');qa('[data-compare-frame]').forEach(b=>b.addEventListener('click',()=>showFrame(b.dataset.compareFrame)));controls();
 }
 async function select(target,{indicate=false,message='',automatic=false}={}){
  stopPending();const token=generation;pending=target;phase=indicate?'indicating':'loading';screen.setAttribute('aria-busy','true');if(target.mode==='presets')q(`[data-preset="${target.preset}"]`)?.setAttribute('aria-busy','true');
  if(indicate)screen.querySelector('.studio-hotspot')?.classList.add('indicating');tell(message||'正在加载对应版本的同源原帧…');controls();
  const frame=target.mode==='presets'?presets[target.preset].frame:tutorials[target.mode][target.step].frame;
  const next=new Image();next.decoding='async';next.src=asset(frame);const decoded=next.decode().then(()=>true,()=>false);
  if(indicate)await new Promise(resolve=>{timer=setTimeout(()=>{timer=null;resolve();},reduced.matches?180:650);});
  const ok=await decoded;if(token!==generation)return;if(automatic&&!active()){stopPending();controls();return;}
  if(!ok){wantsPlay=false;stopPending();controls();tell('同源画面未能加载，保留上一张完整原帧。请检查网络后重试。');if(!currentFrame)q('.studio-frame-placeholder').textContent='同源画面未能加载，请使用下方按钮重试。';return;}
  mode=target.mode;preset=target.preset;stepIndex=target.step;currentFrame=frame;img.src=asset(frame);img.alt=`v2.1.1 stable同源模拟器截图，非实机：${mode==='presets'?presets[preset].name:tutorials[mode][stepIndex].label}`;img.hidden=false;q('.studio-frame-placeholder').hidden=true;pending=null;phase='idle';screen.removeAttribute('aria-busy');qa('[data-preset]').forEach(b=>b.removeAttribute('aria-busy'));draw();tell(mode==='presets'?`已载入：${presets[preset].name} · 实际固件同源首页。网页未连接设备。`:`第${stepIndex+1} / ${last()+1}步：${tutorials[mode][stepIndex].label} · 同源原始帧`);schedule();
 }
 function advance(direction,automatic=false){if(!automatic){wantsPlay=false;if(mobile.matches)q('.studio-stage').scrollIntoView({block:'start',behavior:'instant'});}if(pending&&pending.mode!==mode)return;const base=mode==='presets'&&pending?pending:{mode,preset,step:stepIndex};if(base.mode==='presets')select({mode:'presets',preset:(base.preset+direction+5)%5,step:0},{automatic});else{let next=base.step+direction;if(next>tutorials[base.mode].length-1)next=0;next=Math.max(0,next);const item=tutorials[base.mode][base.step];select({mode:base.mode,preset:base.preset,step:next},{indicate:direction>0&&base.step<tutorials[base.mode].length-1,message:direction>0&&item.action?`演示点击：${item.action}。先显示位置，再回放真实下一帧。`:'正在回看同源原帧。',automatic});}}
 q('.preset-list').innerHTML=presets.map((p,i)=>`<button class="preset-choice" data-preset="${i}" aria-pressed="${i===0}" aria-label="查看${p.name}完整搭配"><span class="preset-thumb">${thumb(p.frame,p.name+'同源首页')}</span><span>${p.name}</span></button>`).join('');qa('[data-preset]').forEach(b=>b.addEventListener('click',()=>{wantsPlay=false;select({mode:'presets',preset:Number(b.dataset.preset),step:0},{message:`正在切换：${presets[Number(b.dataset.preset)].name}同源原帧…`});}));
 qa('[data-studio-mode]').forEach(b=>b.addEventListener('click',()=>{wantsPlay=false;select({mode:b.dataset.studioMode,preset,step:0},{message:'正在载入实际固件录制的首帧…'});}));
 qa('[data-studio-action]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.studioAction;if(a==='next')advance(1);else if(a==='prev')advance(-1);else if(a==='reset'){wantsPlay=false;select({mode,preset,step:0});}else if(a==='zoom'){if(currentFrame)showFrame(currentFrame);}else{wantsPlay=!wantsPlay;stopPending();tell(wantsPlay?'已开始回放同源原帧。可随时暂停或手动接手。':'已暂停，保留当前同源帧。');schedule();}}));
 function suspend(){stopPending();controls();if(active()){if(!currentFrame)select({mode,preset,step:stepIndex});else schedule();}}
 const dialog=q('.studio-lightbox');dialog.querySelector('.close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{lightboxFocus?.focus({preventScroll:true});suspend();});dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 document.addEventListener('visibilitychange',suspend);window.addEventListener('hashchange',suspend);reduced.addEventListener('change',()=>{if(reduced.matches)wantsPlay=false;suspend();});mobile.addEventListener('change',placeControls);new MutationObserver(suspend).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 if('IntersectionObserver'in window)new IntersectionObserver(entries=>{near=entries.some(e=>e.isIntersecting);suspend();},{threshold:0}).observe(host);else near=true;
 window.addEventListener('pagehide',()=>{disposed=true;stopPending();controls();});window.addEventListener('pageshow',()=>{disposed=false;suspend();});window.PaperspaceCustomize={state:()=>({mode,preset,step:stepIndex,steps:mode==='presets'?5:tutorials[mode].length,phase,wantsPlay,timerPending:timer!==null,active:active(),reduced:reduced.matches,currentFrame,pending:pending?{...pending}:null,source:'v2.1.1-stable-native'}),frames:()=>({presets:presets.map(p=>p.frame),tutorials:Object.fromEntries(Object.entries(tutorials).map(([k,v])=>[k,v.map(s=>s.frame)]))})};
 placeControls();draw();select({mode,preset,step:stepIndex});
}
