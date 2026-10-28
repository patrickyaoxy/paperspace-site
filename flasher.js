/* paperspace v2.0.8：高级本地只读预检与独立内存协议演练。真实安装使用隔离 real-flash 模块。 */
(() => {
  'use strict';
  const SOURCE = '79f2f5ad303b9a588d551e3e0eb4b6e5735bc56b';
  const MiB = 1024 * 1024, MAX_FILE = 20 * MiB, MAX_TOTAL = 64 * MiB;
  // 发布脚本 LINK_FILES 的声明合同独立于本页实际读取预算。
  const DECLARED_LIMITS = Object.freeze({'linker.map':32 * MiB, 'size.log':MiB});
  const AUXILIARY_FILES = new Set(['linker.map','size.log','link-evidence.json']);
  const ROLES = {bootloader:[0,0x8000], 'partition-table':[0x8000,0x9000], app:[0x10000,0x510000], otadata:[0xF10000,0xF12000]};
  const PARTS = [['nvs',1,2,0x9000,0x5000],['phy_init',1,1,0xE000,0x1000],['ota_0',0,16,0x10000,0x500000],['storage',1,129,0x510000,0x500000],['ota_1',0,17,0xA10000,0x500000],['otadata',1,0,0xF10000,0x2000]];
  const enc = new TextEncoder(), dec = new TextDecoder('utf-8', {fatal:true});
  const safePath = s => typeof s === 'string' && s.length > 0 && s.length <= 240 && !/[\\:\x00-\x1f\x7f]/.test(s) && !s.startsWith('/') && s.split('/').every(p=>p && p!=='.' && p!=='..');
  const object = x => !!x && typeof x==='object' && !Array.isArray(x);
  const shaPattern = x => typeof x==='string' && /^[0-9a-f]{64}$/.test(x);
  const offset = x => typeof x==='string' && /^(0x[0-9a-f]+|[0-9]+)$/i.test(x) ? Number(x) : NaN;
  const hex = x=>'0x'+x.toString(16).toUpperCase();
  const equal = (a,b)=>a.length===b.length && a.every((v,i)=>v===b[i]);
  async function digest(bytes) {
    if (!globalThis.crypto?.subtle) throw new Error('Web Crypto 不可用。请通过 localhost 或 HTTPS 预览；file:// 环境可能不支持 SHA-256。');
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  function appHeader(b) {
    if(b.length<288) throw new Error('应用镜像不足 288 字节');
    const v = new DataView(b.buffer,b.byteOffset,b.byteLength);
    const ascii = (a,z)=>{const p=b.slice(a,z);const n=p.indexOf(0);const t=p.slice(0,n<0?p.length:n);if(t.some(x=>x>127)) throw new Error('应用描述符不是 ASCII');return String.fromCharCode(...t);};
    if(b[0]!==0xE9 || v.getUint16(12,true)!==9 || (b[3]&0xF0)!==0x40 || v.getUint32(32,true)!==0xABCD5432 || ascii(48,80)!=='2.0.8' || ascii(144,176)!=='v6.1') throw new Error('应用头、ESP32-S3 / 16MB、版本或 IDF v6.1 不符合 v2.0.8 合同');
    return true;
  }
  async function validate(input, options={}) {
    const checks=[], hashes={}; let manifest=null, args=null, app=null;
    const progress=options.onProgress || (()=>{}), current=options.isCurrent || (()=>true);
    const check=(name,pass,detail)=>{checks.push({name,status:pass?'PASS':'FAIL',detail});return pass;};
    const pending=(name,detail)=>checks.push({name,status:'未验证',detail});
    const requireValue=(x,msg)=>{if(!x)throw new Error(msg);};
    const result=()=>({ok:checks.length>0&&!checks.some(x=>x.status==='FAIL'),checks,hashes,manifest,spans:[],device_connected:false,device_layout:'UNKNOWN',write_performed:false,bytes_written:0,target_address:null,formal_package_verified:false});
    try {
      requireValue(object(input),'输入必须是包内相对路径到 Uint8Array 的映射');
      const names=Object.keys(input);requireValue(names.length>0&&names.length<=100,'文件数量须为 1–100');
      let total=0; for(const name of names){requireValue(safePath(name),'不安全的包内路径：'+name);const b=input[name];requireValue(b instanceof Uint8Array,'文件必须是字节数组');requireValue(b.byteLength<=MAX_FILE,'单文件超过 20 MiB');total+=b.length;}
      requireValue(total<=MAX_TOTAL,'所选文件总量超过 64 MiB');
      const json=name=>{const b=input[name];requireValue(b,'缺少 '+name);requireValue(b.length<=MiB,name+' 超过 1 MiB');return JSON.parse(dec.decode(b));};
      manifest=json('manifest.json'); requireValue(object(manifest),'manifest 须为对象');
      const m=manifest;
      check('发布合同字段',m.schema===1&&m.source_sha===SOURCE&&m.version==='2.0.8'&&m.tag==='v2.0.8'&&m.profile==='product'&&m.chip==='esp32s3'&&m.flash_size==='16MB'&&m.hardware==='NOT_TESTED'&&m.idf_version==='ESP-IDF v6.1'&&m.app_descriptor?.version==='2.0.8'&&m.app_descriptor?.idf_version==='v6.1'&&m.app_descriptor?.chip==='esp32s3'&&m.app_descriptor?.flash_size==='16MB','schema 1 · 固定源码与版本 · hardware=NOT_TESTED；这是包内自述，不是认证');
      requireValue(object(m.files)&&Object.keys(m.files).length<=100,'files 清单缺失或超过 100 项');
      for (const [name,info] of Object.entries(m.files)) requireValue(safePath(name)&&object(info)&&shaPattern(info.sha256)&&Number.isSafeInteger(info.bytes)&&info.bytes>=0&&(!Object.hasOwn(DECLARED_LIMITS,name)||info.bytes<=DECLARED_LIMITS[name]),'文件清单字段、路径或已知声明合同非法：'+name);
      let done=0;const selected=names.filter(n=>n!=='manifest.json'&&n!=='SHA256SUMS');
      for(const name of selected) {
        requireValue(current(),'校验已取消');progress({done,total:selected.length,name});
        const hash=await digest(input[name]);requireValue(current(),'校验已取消');hashes[name]=hash;
        const info=m.files[name]; check('SHA-256 · '+name,!!info&&info.bytes===input[name].length&&info.sha256===hash,`${input[name].length} 字节 · ${hash}`);
        done++;progress({done,total:selected.length,name});
      }
      for(const name of Object.keys(m.files)) if(!input[name]) pending('清单缺项 · '+name,`${m.files[name].bytes} 字节（仅清单声明，未读取或散列）；不能视为完整发布包通过`);
      args=json('flasher_args.json');requireValue(object(args)&&object(args.flash_files)&&object(m.flash_files),'缺少真实 flash_files 映射');
      check('args 芯片与容量',args.extra_esptool_args?.chip==='esp32s3'&&args.flash_settings?.flash_size==='16MB','只能核文件声明；实际设备未知');
      requireValue(Object.keys(args.flash_files).length===4&&Object.keys(m.flash_files).length===4,'flash_files 必须为四个偏移字符串到路径的映射');
      const spans=[], used=new Set();
      for(const [role,[start,limit]] of Object.entries(ROLES)) {
        const a=args[role];requireValue(object(a)&&offset(a.offset)===start&&a.encrypted==='false'&&safePath(a.file)&&args.flash_files[a.offset]===a.file&&m.flash_files[a.offset]===a.file&&!used.has(a.file),'角色地址、路径、加密或映射不一致：'+role);
        used.add(a.file);const info=m.files[a.file];requireValue(info&&info.bytes>0&&start+info.bytes<=limit,'角色超出受审范围：'+role);
        spans.push({role,start,end:start+info.bytes,file:a.file,present:!!input[a.file]});
      }
      spans.sort((a,b)=>a.start-b.start);requireValue(spans.every((s,i)=>!i||spans[i-1].end<=s.start),'角色写入范围重叠');
      check('地址、分区边界与重叠',true,'文件声明限于 bootloader / partition-table / ota_0 / 初始 otadata；不证明设备实际布局');
      app=input[args.app.file];requireValue(app,'缺少 args.app.file 指向的原始应用镜像');appHeader(app);check('应用镜像头预检',true,'E9 / ESP32-S3 / 16MB / 2.0.8 / v6.1；不是完整 ESP 镜像校验');
      const tf=m.tf_update;requireValue(object(tf)&&tf.image==='tf-update/update.bin'&&tf.digest_file==='tf-update/update.sha256'&&shaPattern(tf.sha256),'tf_update 合同错误');
      const image=input[tf.image],sidecar=input[tf.digest_file];requireValue(image&&sidecar,'缺少 tf-update/update.bin 或 update.sha256');
      check('TF / app 逐字节一致',equal(image,app)&&image.length===tf.bytes&&m.files[tf.image]?.bytes===tf.bytes&&hashes[tf.image]===tf.sha256&&m.files[tf.image]?.sha256===tf.sha256,'update.bin 是 app 副本；OTA 地址由设备运行时选择');
      check('生产包摘要旁车',equal(sidecar,enc.encode(tf.sha256+'\n')),'严格为 64 位小写 SHA-256 + LF');
      const ota=input[args.otadata.file];if(ota)check('初始 otadata',ota.length===8192&&ota.every(x=>x===255),'仅初始化；不是设备启动状态备份');else pending('初始 otadata','未选择，仅校验声明边界');
      const part=input[args['partition-table'].file];
      if(part){
        let valid=part.length===0xC00;
        if(valid){const dv=new DataView(part.buffer,part.byteOffset,part.byteLength);for(let i=0;i<PARTS.length;i++){const [name,type,sub,start,size]=PARTS[i],p=i*32;const label=part.slice(p+12,p+28);const n=label.indexOf(0);valid=valid&&dv.getUint16(p,true)===0x50AA&&part[p+2]===type&&part[p+3]===sub&&dv.getUint32(p+4,true)===start&&dv.getUint32(p+8,true)===size&&dv.getUint32(p+28,true)===0&&equal(label,Uint8Array.from([...enc.encode(name),...new Array(16-name.length).fill(0)]))&&n>=0;}valid=valid&&part[192]===0xEB&&part[193]===0xEB&&part.slice(194,208).every(x=>x===255)&&part.slice(224).every(x=>x===255);}
        check('分区表结构预检',valid,'受审 16MiB 双 5MiB app + 5MiB FAT；未验证分区表 MD5，不代表完整发布脚本验收');
      }else pending('分区表结构预检','未选择分区二进制，设备实际布局仍未知');
      pending('设备兼容与来源认证','无 board/model/签名字段；真实芯片、分区、Secure Boot、加密、备份及健康状态均未知');
      pending('完整发布包验收','浏览器只做上述子集；未验证 SHA256SUMS、四种文本 args、CSV、合并镜像空洞与生产证据。没有正式可分发包托管于此。');
      const r=result();r.spans=spans;return r;
    }catch(e){check('输入或校验错误',false,e.message||String(e));return result();}
  }
  // This selects one declared target; it never grants trust or hardware capability.
  const state={phase:'empty',mode:'ota',synthetic:false,connection:'disconnected',progress:0,message:'选择本地文件集，或载入不可刷写的合成 SDK 测试向量。',report:null,protocol:null,protocolPlan:null,bytes_written:0,device_connected:false,device_layout:'UNKNOWN',write_performed:false,target_address:null,realWriteEnabled:false};
  let epoch=0,files=null,controller=null,protocolTask=null,closing=null,sdkPromise=null;
  const scriptBase=document.currentScript?.src||location.href;
  const engineURL=new URL('flash-protocol/engine.js',scriptBase);
  const loadSDK=()=>sdkPromise||(sdkPromise=import(engineURL.href).catch(e=>{sdkPromise=null;throw new Error('本地 SDK 模块加载失败，请使用 localhost / HTTPS 预览：'+e.message);}));
  const root=document.getElementById('flash-root');
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(root) root.innerHTML=`<section class="flash-shell"><div class="flash-heading"><p class="eyebrow">LOCAL CHECK / SDK MOCK PROTOCOL</p><h1>更新之前，<br>先把每一步看清。</h1><p>v2.0.8 本地预检与官方 SDK mock 协议测试。<strong>不是真机成功，不是兼容签发。</strong></p><span class="flash-tag">官方协议 · 内存 mock · 真机 0 字节写入</span></div><div class="flash-warning">此折叠区只做本地文件预检和内存 mock；不连接设备。正式安装状态与条件见上方USB安装入口。所选文件不上传。</div><div class="flash-grid"><div class="flash-card"><h2><span>01</span> 选择操作</h2><div class="flash-modes"><label><input type="radio" name="flash-mode" value="ota" checked> 日常 OTA · 默认保留数据</label><label><input type="radio" name="flash-mode" value="install"> 首次安装 / 双槽迁移</label><label><input type="radio" name="flash-mode" value="recover"> 恢复底座 / 启动故障</label></div><p id="flash-impact" class="flash-note"></p><h2><span>02</span> 检查本地文件</h2><p class="flash-note">选择同一发布包解压后的目录。文件列表请同时选择 manifest.json、flasher_args.json、app 与 tf-update 文件；目录层级以 manifest 为准。最多选择 100 项；辅助证据 linker.map / size.log / link-evidence.json 会跳过，不读取、不散列。其余读取项单项 20 MiB / 总计 64 MiB；完整包仍未验证。</p><div class="flash-actions"><label class="flash-button">选择解压目录<input id="flash-directory" type="file" webkitdirectory multiple></label><label class="flash-button">选择文件列表<input id="flash-files" type="file" multiple></label><button id="flash-demo" class="flash-button">载入合成演练包</button></div><p id="flash-input-name" class="flash-note">尚未载入文件</p><button id="flash-validate" class="flash-button flash-primary" disabled>开始只读预检</button></div><div class="flash-card"><h2><span>03</span> SDK mock 连接与测试</h2><label class="flash-select">模拟芯片<select id="flash-chip"><option value="esp32s3">ESP32-S3（mock）</option><option value="unknown">未知芯片（mock）</option><option value="esp32">ESP32-C3 · 错误芯片（mock）</option></select></label><div class="flash-actions"><button id="flash-connect" class="flash-button">连接内存 mock</button><button id="flash-disconnect" class="flash-button" disabled>断开 mock</button></div><label class="flash-inject"><input id="flash-inject" type="checkbox"> 注入 SDK ACK 失败（首块确认后）</label><label id="flash-risk-wrap" class="flash-inject" hidden><input id="flash-risk" type="checkbox"> 我已理解这是破坏性方案演练；真机操作必须另行确认可恢复备份与实际分区。</label><p id="flash-plan" class="flash-note"></p><div class="flash-actions"><button id="flash-run" class="flash-button flash-primary" disabled>运行合成 SDK 协议测试</button><button id="flash-cancel" class="flash-button" disabled>取消当前任务</button><button id="flash-reset" class="flash-button">重置测试</button><button id="flash-recover" class="flash-button" disabled>恢复 mock 会话</button></div><button id="flash-real-write" class="flash-button" disabled aria-describedby="flash-hardware-reason">真实设备写入（未开放）</button><p id="flash-hardware-reason" class="flash-note">本折叠区仅供内存协议演练，没有真实设备权限。官网安装请使用上方入口；演练结果不能证明真机兼容或启动健康。</p><p class="flash-note">连接将真实执行官方 SDK 的 SYNC、芯片识别和 mock 分区读取。前提：mock stub 已运行；未测试 stub 上传。</p><div class="flash-status" role="status" aria-live="polite"><strong id="flash-phase">等待文件</strong><p id="flash-message"></p></div><progress id="flash-progress" value="0" max="100" aria-label="文件校验或真实 SDK ACK 进度"></progress><p id="flash-protocol-summary" class="flash-note">真实设备连接：否 · 真实写入：0 字节<br>OTA 目标：null · 未修改真实启动选择</p><details class="flash-details"><summary>查看 SDK 字节协议证据</summary><pre id="flash-protocol-log" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;font:inherit;font-size:11px">尚未执行协议命令</pre></details></div></div><section class="flash-card flash-results"><h2>本地文件一致性检查结果</h2><p id="flash-summary" class="flash-note">尚未校验。SHA 相符只能证明包内一致性，不能认证发布者或设备型号。</p><div id="flash-checks"></div></section><details class="flash-details"><summary>已知边界与恢复条件</summary><p>OTA 的 update.bin 没有固定烧录地址。设备必须在真实运行时选择非活动槽，并核验版本、精确分区、pending-verify 与项目归属。本页不会完成这些步骤。默认 OTA 计划不可执行；合成协议测试另在内存 mock 的 app 分区执行，不等于 OTA 提交。</p><p>首次双槽迁移需要读取旧分区并验证可恢复备份。连续 merged 镜像即使空洞为 FF 也会覆盖 NVS / 内部 FAT / ota_1，不能当作保留数据升级。恢复启动选择与恢复底座也不是同一个动作。</p><p>这里只验证镜像头的必要条件与文件合同，不验证完整 ESP 镜像、设备签名或真机健康。Web Crypto 需要浏览器安全上下文；建议 localhost / HTTPS，file:// 不可用时会明确报错。</p></details></section>`;
  if(root){
    const shell=root.querySelector('.flash-shell');
    const advanced=document.createElement('details');advanced.id='flash-advanced';advanced.className='flash-details flash-advanced';
    const summary=document.createElement('summary');summary.textContent='协议演练 / 本地检查';advanced.append(summary);
    while(shell.children.length>1)advanced.append(shell.children[1]);
    shell.firstElementChild.innerHTML='<p class="eyebrow">FIRMWARE UPDATE</p><h1>连接设备，<br>自动刷入官网固件。</h1><p>点击“连接并刷机”并选择设备即可。需要清空内部数据时会明确确认一次，备份可选；支持范围和测试状态以下方说明为准。</p>';
    const visitor=document.createElement('section');visitor.id='flash-real-root';visitor.className='flash-visitor';
    visitor.innerHTML='<p role="status">正在载入安装工具…</p>';
    shell.append(visitor,advanced);
  }
  const $=id=>root?.querySelector('#flash-'+id);
  const busy=()=>['reading','validating','connecting','running','recovering','disconnecting'].includes(state.phase)||!!protocolTask||!!closing;
  const connected=()=>state.connection==='esp32s3'&&controller&&!state.protocol?.closed;
  function render(){if(!root)return;
    const labels={empty:'等待文件',reading:'读取本地文件',loaded:'文件已载入',validating:'计算 SHA-256',connecting:'官方 SDK 正在连接内存 mock',ready:'本地预检子集通过',invalid:'预检未通过',running:'SDK 正在交换真实协议字节',recovering:'重连并重新读取 mock 分区',disconnecting:'正在停止并断开 mock',complete:'SDK mock 校验完成 · 真机 0 写入',cancelled:'已请求取消 · 真机 0 写入',failed:'SDK mock 失败 · 可恢复'};
    $('phase').textContent=labels[state.phase]||state.phase;$('message').textContent=state.message;$('progress').value=state.progress;
    $('impact').textContent=state.mode==='ota'?'默认保留数据 OTA：update.bin 由固件运行时选择非活动槽，目标地址 null。真实设备条件未知，默认 OTA 不可执行。合成 SDK 测试独立于此计划。':state.mode==='install'?'高风险：首次安装 / 迁移会改变底座和启动布局，连续 merged 镜像会覆盖持久数据。此折叠区不执行设备迁移，不能通过 mock 测试签发真机兼容性。':'高风险：恢复需匹配 bootloader、分区与可恢复备份；重置 otadata 不是恢复用户数据。此折叠区不执行恢复写入。';
    $('plan').textContent=state.mode==='ota'?'本页测试：官方 SDK 同步与识别 → 实读 mock 分区 → 核对合成 app 计划 → 分块 ACK → MD5 与 SHA-256 读回。仅向内存 mock 的 app 区写测试向量；OTA 目标仍为 null，未提交启动选择。':'当前 SDK 链只测试合成 app 分块协议，不执行首次安装、迁移或恢复。切回日常 OTA 可查看独立的合成协议测试。';
    $('risk-wrap').hidden=state.mode==='ota';
    $('validate').disabled=!files||busy();$('demo').disabled=busy();
    $('connect').disabled=busy()||state.connection!=='disconnected';$('disconnect').disabled=(!controller&&!protocolTask)||!!closing;
    $('run').disabled=busy()||!state.synthetic||!state.report?.ok||!connected()||state.mode!=='ota'||['failed','cancelled'].includes(state.phase);
    $('recover').disabled=busy()||!controller||!['failed','cancelled'].includes(state.phase);
    $('cancel').disabled=!busy()||!!closing;$('chip').disabled=busy()||state.connection!=='disconnected';$('inject').disabled=busy();$('real-write').disabled=true;
    root.querySelectorAll('input[name="flash-mode"]').forEach(x=>x.disabled=busy());
    $('summary').textContent=state.report?`${state.synthetic?'合成协议向量 · 不可刷写，不是正式固件。':'用户所选文件 · 只读校验，不授予 mock 写入许可。'} ${state.report.ok?'必要预检子集通过。':'存在失败。'} 完整发布包、设备与来源认证仍未验证。`:'尚未校验。SHA 相符只能证明包内一致性，不能认证发布者或设备型号。';
    $('checks').innerHTML=state.report?state.report.checks.map(x=>`<div class="flash-check"><span class="flash-check-status ${x.status==='FAIL'?'is-fail':x.status==='PASS'?'is-pass':''}">${escape(x.status)}</span><div><strong>${escape(x.name)}</strong><p>${escape(x.detail)}</p></div></div>`).join(''):'';
    const p=state.protocol;
    $('protocol-summary').textContent=`真实设备连接：否 · 真实写入：0 字节\nOTA 目标：null · 未修改真实启动选择`+(p?`\nmock 命令 ${p.commandCount} 条 · mock 已接收块 ${p.blocks.length} · mock 内存累计写入 ${p.mockBytesWritten.toLocaleString()} 字节`:'');
    if(p){const opNames={8:'SYNC',20:'GET_SECURITY_INFO',13:'SPI_ATTACH',9:'WRITE_REG / SPI RDID',10:'READ_REG / SPI RDID',210:'READ_FLASH',2:'FLASH_BEGIN',3:'FLASH_DATA',4:'FLASH_END (不重启)',19:'SPI_FLASH_MD5'};
      $('protocol-log').textContent=['官方 esptool-js 0.7.0 · 本地包 · MOCK_ONLY','stub 前提：已经运行（未执行上传）',`mock 分区读取：${p.session.device?'已由协议读回并核 MD5 / 布局':'未通过'}`,`真实 board/model：UNKNOWN；正式包：未签发`,...p.commands.map((c,i)=>`${i+1}. 0x${c.opcode.toString(16)} ${opNames[c.opcode]||'命令'} · ${c.bytes} 字节`),`块序号：${p.blocks.map(b=>b.seq).join(', ')||'尚无'}`,`累计读取 ACK：${p.readAcks.join(', ')||'尚无'}`,`整片擦除：${p.wholeChipErases} · 复位信号：${p.resetSignals.length}`,p.lastPlan?.target_address!==null&&p.lastPlan?.target_address!==undefined?`仅合成 mock app 地址：${hex(p.lastPlan.target_address)}（不是 OTA 目标）`:'默认 OTA 地址：null',p.lastResult?.readback_sha256?`SDK MD5 及 SHA-256 读回通过：${p.lastResult.readback_sha256}`:'最终摘要读回：尚未成功'].join('\n');
    }else $('protocol-log').textContent='尚未执行协议命令；真实写入功能关闭。';
  }
  async function trackProtocol(fn){const task=Promise.resolve().then(fn);protocolTask=task;try{return await task;}finally{if(protocolTask===task)protocolTask=null;if(controller)state.protocol=controller.metrics();render();}}
  function retireProtocol(){const old=controller,pending=protocolTask;controller=null;if(old){old.cancel();state.protocol=old.metrics();}state.connection='disconnected';state.protocolPlan=null;
    const task=Promise.resolve(pending).catch(()=>{}).then(async()=>{if(old){await old.disconnect();if(!controller)state.protocol=old.metrics();}}).catch(()=>{}).finally(()=>{if(closing===task)closing=null;render();});closing=task;return task;
  }
  function invalidate(message,phase='loaded',{dropProtocol=true}={}){epoch++;if(dropProtocol)retireProtocol();state.report=null;state.protocolPlan=null;state.progress=0;state.phase=phase;state.message=message;render();}
  function cancel(reason='已请求取消。已发送的 mock 块可能完成；后续协议命令会停止，不承诺回滚。真实写入 0 字节。'){epoch++;controller?.cancel();state.phase='cancelled';state.message=reason;render();}
  function candidate(){if(!files||!state.report?.ok)throw new Error('请先完成本地预检');return {kind:state.synthetic?'SYNTHETIC_PROTOCOL_VECTOR_NOT_FLASHABLE':'USER_LOCAL_FILES_NOT_AUTHENTICATED',formalVerified:false,manifest:state.report.manifest,args:JSON.parse(dec.decode(files['flasher_args.json'])),files:Object.fromEntries(Object.entries(files).filter(([name])=>name!=='manifest.json'&&name!=='SHA256SUMS'))};}
  async function defaultPlan(engine,token){try{const p=await engine.plan(candidate());if(token===epoch&&engine===controller)state.protocolPlan=p;}catch(e){if(token===epoch&&engine===controller)state.protocolPlan={executable:false,target_address:null,reason:e.message};}}
  async function selectFiles(list) {
    invalidate('读取所选文件，仅在浏览器内存中处理。','reading');const token=epoch;files=null;state.synthetic=false;
    try{
      const selected=Array.from(list);if(!selected.length){invalidate('未选择文件。','empty');return;}
      if(selected.length>100)throw new Error('文件数量超过 100 项（包含跳过的辅助项）。');
      let paths=selected.map(f=>f.webkitRelativePath||f.name);const dirs=selected.some(f=>f.webkitRelativePath);
      if(paths.some(p=>!safePath(p)))throw new Error('所选文件包含不安全路径。');
      if(dirs){const prefix=paths[0].split('/')[0]+'/';if(!paths.every(p=>p.startsWith(prefix)))throw new Error('请选择同一个解压目录');paths=paths.map(p=>p.slice(prefix.length));}
      if(!dirs)paths=paths.map(p=>p==='update.bin'||p==='update.sha256'?'tf-update/'+p:p);
      const seen=new Set();for(const path of paths){if(!safePath(path)||seen.has(path))throw new Error('路径不安全或出现重名；请改用选择解压目录。');seen.add(path);}
      const skipped=paths.filter(p=>AUXILIARY_FILES.has(p));
      const readable=selected.map((file,i)=>({file,path:paths[i]})).filter(x=>!AUXILIARY_FILES.has(x.path));
      const total=readable.reduce((s,x)=>s+x.file.size,0);
      if(readable.some(x=>!Number.isSafeInteger(x.file.size)||x.file.size<0||x.file.size>MAX_FILE)||total>MAX_TOTAL)throw new Error('实际读取项超过大小上限（20 MiB 单项 / 64 MiB 总量）；辅助证据已排除。');
      const loaded=Object.create(null);for(const {file,path}of readable){loaded[path]=new Uint8Array(await file.arrayBuffer());if(token!==epoch)return;}
      files=loaded;state.phase='loaded';state.message='本地文件已载入。只授予只读预检，不将所选文件冒充合成测试向量。';$('input-name').textContent=`用户文件 · 读取 ${readable.length} 项 · ${total.toLocaleString()} 字节`+(skipped.length?`；已跳过辅助证据：${skipped.join(' / ')}（不读取、不散列；完整包未验证）`:'');render();
    }catch(e){if(token!==epoch)return;files=null;state.phase='invalid';state.message=e.message;render();}
  }
  async function runValidation(){if(!files||busy())return;invalidate('逐个计算本地文件 SHA-256。','validating',{dropProtocol:false});const token=epoch;
    const report=await validate(files,{isCurrent:()=>epoch===token,onProgress:p=>{if(epoch!==token)return;state.progress=p.total?Math.round(p.done/p.total*100):0;state.message=`SHA-256 ${p.done}/${p.total} · ${p.name}`;render();}});
    if(token!==epoch)return;state.report=report;if(report.ok&&controller){const engine=controller;await trackProtocol(()=>defaultPlan(engine,token));}
    if(token!==epoch)return;state.phase=report.ok?'ready':'invalid';state.progress=100;state.message=report.ok?'本地必要预检通过；设备、完整包和发布者身份仍未认证。'+(state.synthetic?'可连接内存 mock，运行官方 SDK 协议测试。':'用户文件只读校验；不能启用设备或合成写入。'):'发现输入或一致性错误，请检查失败项。';render();
  }
  async function synthetic(){if(busy())return;invalidate('正在载入有明确标记的合成 SDK 测试向量。','reading');const token=epoch;
    try{const sdk=await loadSDK();if(token!==epoch)return;const c=sdk.createSyntheticCandidate();const data=Object.assign(Object.create(null),c.files);data['manifest.json']=enc.encode(JSON.stringify(c.manifest));files=data;state.synthetic=true;state.phase='loaded';state.message='合成 SDK 向量已载入：有容器结构与校验和，不能作为可运行固件刷写；底座缺项仍未验证。';$('input-name').textContent=`合成 SDK 协议向量 · ${Object.keys(data).length} 项 · app 32 KiB · 非正式包 / 不可刷写`;render();
    }catch(e){if(token!==epoch)return;state.phase='invalid';state.message=e.message;render();}
  }
  async function connectMock(){if(busy()||state.connection!=='disconnected')return;const token=++epoch,chip=$('chip').value;state.phase='connecting';state.progress=0;state.message='官方 SDK 正在向内存串口发送 SYNC，并识别芯片、读取分区。没有设备权限请求。';render();
    try{await trackProtocol(async()=>{const sdk=await loadSDK();if(token!==epoch)return;const engine=sdk.createController({chip});controller=engine;await engine.connect();if(token!==epoch||engine!==controller)return;state.connection=chip;state.protocol=engine.metrics();if(state.report?.ok)await defaultPlan(engine,token);if(token!==epoch)return;state.phase=state.report?.ok?'ready':files?'loaded':'empty';state.message='官方 SDK 已识别 mock ESP32-S3 / 16MiB 并读回受审分区。真实 board/model、运行槽与备份仍 UNKNOWN。';});}
    catch(e){if(token!==epoch)return;state.phase='failed';state.connection=chip;state.message='SDK mock 连接或读取被拒绝：'+e.message;render();}
  }
  async function start(){if(busy()||!state.synthetic||!state.report?.ok||!connected()||state.mode!=='ota'||['failed','cancelled'].includes(state.phase))return;const token=++epoch,engine=controller,input=candidate(),inject=$('inject').checked;state.phase='running';state.progress=0;state.message='SDK 正在核对 mock 分区与合成 app 计划；默认 OTA 仍不可执行。';render();
    try{await trackProtocol(async()=>{const result=await engine.run(input,{injectFailure:inject,onProgress:p=>{if(token!==epoch||engine!==controller)return;state.progress=Math.round(p.acknowledgedBytes/p.total*100);state.protocol=engine.metrics();state.message=p.acknowledgedBytes===p.total?'SDK 已收到全部 mock 块 ACK，正在做 MD5 / SHA-256 读回。':`SDK 已确认 mock app ${p.acknowledgedBytes.toLocaleString()} / ${p.total.toLocaleString()} 字节；真实写入 0 字节。`;render();}});if(token!==epoch||engine!==controller)return;state.phase='complete';state.progress=100;state.protocol=engine.metrics();state.message=`官方 SDK mock 协议与读回摘要通过。仅 mock 内存写入 ${result.mock_bytes_written.toLocaleString()} 字节；真实设备写入 0 字节，未执行 OTA commit。`;});}
    catch(e){if(token!==epoch||engine!==controller)return;state.phase='failed';state.protocol=engine.metrics();state.message=`SDK mock 失败：${e.message}。mock 已写 ${state.protocol.mockBytesWritten.toLocaleString()} 字节可能保留；无回滚承诺。真实写入 0 字节，可恢复 mock 会话后重试。`;render();}
  }
  async function disconnectMock(){const token=++epoch;state.phase='disconnecting';state.message='正在停止 SDK 并关闭原始内存 mock 流。';const stop=retireProtocol();render();await stop;if(token!==epoch)return;state.phase=state.report?.ok?'ready':files?'loaded':'empty';state.message='mock 已断开；真实设备从未连接。再次测试需重新连接。';render();}
  async function recoverMock(){if(busy()||!controller||!['failed','cancelled'].includes(state.phase))return;const token=++epoch,engine=controller;state.phase='recovering';state.message='重新连接同一内存 mock，重读身份和分区；旧计划失效，部分 mock 写入不会自动回滚。';render();
    try{await trackProtocol(async()=>{await engine.recover();if(token!==epoch||engine!==controller)return;state.connection=$('chip').value;state.protocol=engine.metrics();if(state.report?.ok)await defaultPlan(engine,token);if(token!==epoch)return;state.phase=state.report?.ok?'ready':files?'loaded':'empty';state.progress=0;state.message='mock 身份与分区已重新读取，可生成新合成测试计划。真实设备未连接。';});}catch(e){if(token!==epoch)return;state.phase='failed';state.message='mock 恢复失败：'+e.message;render();}
  }
  async function reset(){const token=++epoch;const stop=retireProtocol();state.report=null;state.protocolPlan=null;state.progress=0;state.phase=files?'loaded':'empty';state.message='已清除旧校验和协议计划，保留所选文件。请重新预检；真实写入仍关闭。';$('risk').checked=false;$('inject').checked=false;render();await stop;if(token!==epoch)return;state.protocol=null;render();}
  if(root){$('directory').addEventListener('change',e=>selectFiles(e.target.files));$('files').addEventListener('change',e=>selectFiles(e.target.files));$('demo').addEventListener('click',synthetic);$('validate').addEventListener('click',runValidation);$('run').addEventListener('click',start);$('cancel').addEventListener('click',()=>cancel());$('connect').addEventListener('click',connectMock);$('disconnect').addEventListener('click',disconnectMock);$('recover').addEventListener('click',recoverMock);$('reset').addEventListener('click',reset);
    $('risk').addEventListener('change',render);root.querySelectorAll('input[name="flash-mode"]').forEach(x=>x.addEventListener('change',()=>{if(busy())return;state.mode=x.value;$('risk').checked=false;state.message=state.mode==='ota'?'默认 OTA 计划地址 null；合成 SDK 协议测试可单独运行。':'首次安装 / 恢复写入未实现，协议测试不能代替此操作验收。';render();}));render();
    window.addEventListener('hashchange',()=>{if(location.hash!=='#flash'&&(controller||protocolTask)){epoch++;retireProtocol();state.phase='cancelled';state.message='已离开刷机页，SDK mock 任务停止并断开；真实写入 0 字节。';render();}});
  }
  window.ZhijianFlash=Object.freeze({validate,appHeader,safePath,getState:()=>JSON.parse(JSON.stringify(state)),loadSynthetic:synthetic,getProtocolTranscript:()=>controller?.transcript()||null,limits:Object.freeze({files:100,fileBytes:MAX_FILE,totalBytes:MAX_TOTAL}),source:SOURCE});
})();
