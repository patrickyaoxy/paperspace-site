/* Real installation UI. Device access exists only in the isolated trusted engine. */
import {loadOwnerPolicy,createController} from './real-flash/engine.js';
const root=document.getElementById('flash-real-root');
if(root){
 root.innerHTML=`<div class="flash-target-status" role="status" aria-live="polite"><strong id="install-heading">正在检查官网固件</strong><p id="install-status"></p><button id="install-reload" class="flash-button">重新检查开放状态</button></div>
 <div class="flash-card install-mode"><h2>选择更新方式</h2><label class="flash-inject"><input type="radio" name="install-mode" value="tf" checked>日常更新 · 使用固件内置 TF 升级，默认保留数据</label><p class="flash-note">将匹配的正式升级文件及校验文件放到 TF 根目录，在设备升级页面主动开始、校验和提交。原固件选择非活动槽并检查启动健康。官网不会把 update.bin 固定写入某个地址。</p><label class="flash-inject"><input type="radio" name="install-mode" value="recovery">USB 应用槽恢复 · 需要完整备份，不是日常 OTA</label><p class="flash-warning" id="install-recovery-warning" hidden>仅支持已经安装精确双槽布局的设备。会擦写你指定的应用槽，可能覆盖当前应用。保留 NVS、内部存储和启动选择，但不保证启动新版，不自动重启。首次安装、分区迁移与底座恢复请使用正式包对应说明。</p></div>
 <ol class="flash-steps"><li><span>01</span><h2>连接设备</h2><p>使用桌面 Chromium 浏览器与数据线。连接前核对官网指定的机型；芯片识别不能代替机型确认。</p><label class="flash-inject"><input id="install-model" type="checkbox">我的设备与官网指定机型一致</label><label class="flash-select">需恢复的应用槽<select id="install-slot"><option value="">请选择，不能自动推断运行槽</option><option value="ota_0">ota_0 · 0x10000</option><option value="ota_1">ota_1 · 0xA10000</option></select></label><button id="install-connect" class="flash-button" disabled>连接设备</button></li>
 <li><span>02</span><h2>备份与确认</h2><p>先读取并保存 16 MiB 完整备份，再确认恢复目标。备份只下载到你的电脑，不上传；保存文件不等于已验证恢复。</p><button id="install-backup" class="flash-button" disabled>读取并下载完整备份</button><a id="install-backup-download" class="flash-button" hidden download>重新保存备份</a><p id="install-backup-info" class="flash-note"></p><label class="flash-inject"><input id="install-saved" type="checkbox" disabled>我已保存备份，并接受指定应用槽会被覆盖</label><label class="flash-select">输入确认文字<span id="install-phrase-hint"></span><input id="install-phrase" autocomplete="off" spellcheck="false" disabled></label><button id="install-confirm" class="flash-button" disabled>确认恢复计划</button></li>
 <li><span>03</span><h2>安装固件</h2><p>仅执行本次确认的范围，按设备 ACK 更新进度。完成后验证摘要，不代替真实启动与显示验收。</p><button id="install-write" class="flash-button flash-primary" disabled>开始恢复写入</button><progress id="install-progress" value="0" max="100" aria-label="备份或设备确认进度"></progress><p id="install-result" class="flash-note" role="status" aria-live="polite"></p></li></ol>
 <div class="flash-actions"><button id="install-cancel" class="flash-button" disabled>取消当前操作</button><button id="install-disconnect" class="flash-button" disabled>断开设备</button></div><p class="flash-note">取消或断开会停止后续命令，已经擦写的区域不会自动恢复。恢复后需按正式说明检查启动、显示与个人数据。</p><details class="flash-details"><summary>目标身份、支持范围与诊断</summary><pre id="install-detail" class="flash-target-details"></pre></details>`;
 const q=id=>root.querySelector('#install-'+id);
 let policy=null,session=null,candidate=null,plan=null,backup=null,confirmation=null,task=null,abort=null,generation=0,backupURL=null;
 let phase='loading',message='',result='',lastError='',connected=false,loadTask=null,closing=null,uncertainOwner=null;
 function uncertain(){const owner=uncertainOwner||session,s=owner?.snapshot();if(s?.portCloseUncertain)uncertainOwner=owner;else if(uncertainOwner&&s?.phase==='closed'&&!s.busy&&!s.connected)uncertainOwner=null;return !!uncertainOwner;}
 const recovery=()=>root.querySelector('[name="install-mode"]:checked').value==='recovery';
 const chosen=()=>recovery()&&q('model').checked&&['ota_0','ota_1'].includes(q('slot').value);
 const available=()=>!!policy?.enabled&&!!candidate;
 const active=()=>!!task||!!loadTask||!!closing;
 const invalidatePlan=()=>{plan=null;backup=null;confirmation=null;q('saved').checked=false;q('phrase').value='';if(backupURL)URL.revokeObjectURL(backupURL);backupURL=null;q('backup-download').hidden=true;};
 function render(){
  const busy=active(),held=uncertain();q('heading').textContent=held?'端口关闭尚未确认':phase==='loading'?'正在检查官网固件':!policy?.enabled?'官网安装尚未开放':phase==='failed'?'操作未完成':phase==='complete'?'应用镜像校验完成':'官网固件 · '+(policy.target?.version||'');
  q('status').textContent=held?'当前页保留原端口所有权，禁止重新连接。可尝试断开原会话；仍未确认时请检查设备连接并关闭本页后再处理，不能视为已安全关闭。':message||policy?.reason||'请检查网络后重试。';q('result').textContent=result;
  q('recovery-warning').hidden=!recovery();
  q('reload').disabled=busy||connected||held;
  root.querySelectorAll('[name="install-mode"]').forEach(x=>x.disabled=busy||connected);
  q('model').disabled=busy||connected||!available()||!recovery();q('slot').disabled=busy||connected||!available()||!recovery();
  q('connect').disabled=busy||connected||held||!available()||!chosen();q('backup').disabled=busy||held||!connected||!plan||phase==='complete';
  q('saved').disabled=busy||!backup||phase==='complete';q('phrase').disabled=busy||!backup||phase==='complete';
  const phrase=plan?`RECOVER ${q('slot').value} ${policy.target.version}`:'';
  q('phrase-hint').textContent=phrase;q('confirm').disabled=busy||!connected||!backup||phase==='complete'||!q('saved').checked||q('phrase').value!==phrase;
  q('write').disabled=busy||held||!connected||!confirmation;q('cancel').disabled=!task&&!loadTask;q('disconnect').disabled=!!closing||(!connected&&!task&&!held);
  q('backup-info').textContent=backup?`${backup.bytes.length.toLocaleString()} 字节 · SHA-256 ${backup.receipt.sha256}`:'';
  q('detail').textContent=JSON.stringify({phase,target:policy?.target||null,device:session?.snapshot()||null,error:lastError,support:'仅精确现有双槽布局的指定应用槽恢复；无 OTA 提交、底座首装、全片擦除或启动健康签发'},null,2);
 }
 function progress(p){const done=p.acknowledgedBytes??p.verifiedBytes??p.completedBytes??p.bytesRead??p.receivedBytes??p.done??0,total=p.total??p.totalBytes??16777216;q('progress').value=Math.min(100,Math.max(0,done/total*100));}
 function failure(e){phase='failed';lastError=e?.message||String(e);message='操作停止：'+lastError;result='已执行的写入不会自动回滚。重新连接前请按正式包的恢复说明处理。';confirmation=null;connected=!!session?.snapshot()?.connected;if(!connected){candidate=null;invalidatePlan();}}
 async function run(action){if(active())return;const token=generation;abort=new AbortController();const promise=(async()=>action(token,abort.signal))();task=promise;render();try{await promise;}catch(e){if(token===generation)failure(e);}finally{if(task===promise)task=null;render();}}
 async function reload(){if(active()||connected||uncertain())return;const token=++generation;policy=null;candidate=null;session=null;invalidatePlan();lastError='';result='';phase='loading';message='读取官网指定的固件身份；不会请求设备权限。';abort=new AbortController();
  const pending=(async()=>{policy=await loadOwnerPolicy({signal:abort.signal});if(token!==generation)return;
   if(!policy.enabled){phase='disabled';message=policy.reason;return;}
   session=createController({policy});message='正在核验官网指定的 manifest 与应用镜像。';render();
   const c=await session.loadCandidate({signal:abort.signal,onProgress:progress});if(token!==generation)return;candidate=c;phase='ready';message=`目标机型 ${policy.target.board} / ${policy.target.model}。请选择更新方式；USB 恢复不会自动选择活动槽或切换启动项。`;
  })();loadTask=pending;render();try{await pending;}catch(e){if(token===generation){policy=null;candidate=null;failure(e);}}finally{if(loadTask===pending)loadTask=null;render();}
 }
 q('connect').addEventListener('click',()=>run(async(token)=>{
  if(uncertain())throw new Error('PORT_CLOSE_UNCERTAIN: 原端口尚未确认关闭，不能重新连接。');
  if(!available()||!chosen())throw new Error('请先核对官网目标、机型与恢复分区。');
  // Calling this method before the first await preserves the actual click activation.
  const connectPromise=session.connectFromUserGesture({board:policy.target.board,model:policy.target.model});phase='connecting';message='等待你在浏览器中选择设备，再核验芯片、安全状态与实际分区。';render();await connectPromise;if(token!==generation)return;connected=true;
  plan=await session.prepare(candidate,{mode:'app-slot-recovery',appPartition:q('slot').value});if(token!==generation)return;phase='connected';message='设备与计划检查通过。请读取完整备份，再确认目标槽。';
 }));
 q('backup').addEventListener('click',()=>run(async(token,signal)=>{confirmation=null;phase='backing-up';message='正在读取设备完整备份，请保持连接。';q('progress').value=0;render();const b=await session.backup(plan,{signal,onProgress:progress});if(token!==generation)return;backup=b;if(backupURL)URL.revokeObjectURL(backupURL);backupURL=URL.createObjectURL(new Blob([b.bytes],{type:'application/octet-stream'}));const link=q('backup-download');link.href=backupURL;link.download=`paperspace-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.bin`;link.hidden=false;link.click();phase='backed-up';message='备份已读取并发起本机下载。请确认实际文件已保存，再输入确认文字。';q('progress').value=100;}));
 q('confirm').addEventListener('click',()=>{try{if(active()||!backup||!q('saved').checked)throw new Error('请先保存完整备份。');confirmation=session.confirm(plan,{phrase:q('phrase').value,backupSha256:backup.receipt.sha256,backupSaved:true});phase='confirmed';message='本次恢复计划已确认。只有点击“开始恢复写入”才会写入应用槽。';}catch(e){failure(e);}render();});
 q('write').addEventListener('click',()=>run(async(token,signal)=>{phase='writing';message='正在按确认范围写入。请勿拔线或关闭页面。';q('progress').value=0;render();const r=await session.execute(plan,confirmation,{signal,onProgress:progress});if(token!==generation)return;confirmation=null;phase='complete';message='应用槽传输与摘要核验完成，未改变启动选择，也未自动重启。';result=JSON.stringify(r,null,2)+'\n请按正式包说明检查实际启动与显示；本页面不能签发启动健康。';q('progress').value=100;}));
 async function stop(disconnect=false){if(closing)return;generation++;abort?.abort();session?.cancel();confirmation=null;const pending=Promise.allSettled([task,loadTask]);message='正在停止后续命令；已写入的区域不会回滚。';const done=(async()=>{await pending;if(disconnect||connected||uncertain()){try{await (uncertainOwner||session)?.disconnect();}catch(e){lastError=e.message;}connected=false;candidate=null;invalidatePlan();}phase='cancelled';message=uncertain()?'原端口关闭仍未确认，当前页继续禁止重连。':'会话已停止。需要重新检查官网固件并连接，旧确认不可复用。';})();closing=done;render();try{await done;}finally{if(closing===done)closing=null;render();}}
 q('cancel').addEventListener('click',()=>stop());q('disconnect').addEventListener('click',()=>stop(true));q('reload').addEventListener('click',reload);
 root.querySelectorAll('[name="install-mode"],#install-model,#install-slot').forEach(x=>x.addEventListener('change',()=>{invalidatePlan();render();}));
 q('saved').addEventListener('change',()=>{confirmation=null;render();});q('phrase').addEventListener('input',()=>{confirmation=null;render();});
 window.addEventListener('hashchange',()=>{if(location.hash!=='#flash'&&(connected||task))void stop(true);});
 window.addEventListener('beforeunload',e=>{if(task&&['writing','backing-up'].includes(phase)){e.preventDefault();e.returnValue='';}});
 window.addEventListener('pagehide',()=>{generation++;abort?.abort();session?.cancel();void session?.disconnect().catch(()=>{});if(backupURL)URL.revokeObjectURL(backupURL);});
 window.PaperspaceInstaller=Object.freeze({snapshot:()=>({phase,message,result,connected,portCloseUncertain:uncertain(),targetEnabled:!!policy?.enabled,candidateReady:!!candidate,busy:active(),confirmationReady:!!confirmation,error:lastError})});
 void reload();
}
