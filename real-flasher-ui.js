/* paperspace installation UI. Only the fixed-policy controller can access a device. */
import {loadOwnerPolicy, createController} from './real-flash/engine.js?v=20261028-one-click-serial-1';

const root = document.getElementById('flash-real-root');
if (root) {
  root.innerHTML = `<div class="flash-target-status" role="status" aria-live="polite">
    <strong id="install-heading">paperspace 固件安装</strong><p id="install-status"></p>
    <p id="install-target" class="flash-note">正在核对官网指定的机型与固件。</p>
    <p id="install-browser" class="flash-note"></p>
    <button id="install-connect" class="flash-button flash-primary" disabled>连接并刷机</button>
  </div>
  <p id="install-scope" class="flash-warning">仅适用官网指定的 Read Pico（ESP32-S3 / 16 MiB）。连接会重启设备，请先保存阅读进度。刷入时保持供电与 USB 连接；中断可能无法启动，已写入内容不会自动回滚。需要全新安装时，会另行确认清空全部 16 MiB 内部设置、阅读进度和文件；TF/SD 卡不改动；独立 PMU 中的屏幕 VCOM 标定不清除，备份可选。</p>
  <p class="flash-note install-beta">v2.1.1 正式渠道精简构建，尚未完成真机验证。写入与读回校验不代表实际启动、显示或硬件验收通过。</p>
  <p id="install-plan" class="flash-note">选择设备后自动检查、获取官网固件并刷入；兼容双槽保留数据更新。</p>
  <div id="install-impact" class="flash-warning install-impact" hidden></div>
  <p id="install-blocked" class="flash-note install-blocked" hidden></p>
  <ul id="install-warnings" class="install-warnings" hidden></ul>
  <p id="install-progress-label" class="flash-note" role="status" aria-live="polite">等待连接设备。</p>
  <progress id="install-progress" value="0" max="100" aria-label="当前阶段进度"></progress>
  <p id="install-result" class="flash-note" role="status" aria-live="polite"></p>
  <div class="flash-actions"><button id="install-cancel" class="flash-button" disabled>取消当前操作</button><button id="install-disconnect" class="flash-button" disabled>断开设备</button></div>
  <p id="install-recovery" class="flash-note">失败后可重新进入下载模式再试；如需恢复原数据，请使用事先保存的完整备份与匹配工具。</p>
  <details id="install-advanced" class="flash-details"><summary>高级选项：可选备份与固件信息</summary>
    <p class="flash-note">需要留存内部资料时，可先只读连接，再保存完整备份。此处不会刷机；备份结束后重新点击“连接并刷机”。</p>
    <button id="install-backup-connect" class="flash-button" disabled>仅连接设备以备份</button>
    <button id="install-backup" class="flash-button" disabled>保存完整备份</button>
    <p id="install-backup-info" class="flash-note"></p>
    <button id="install-reload" class="flash-button">重新检查官网固件</button>
    <p id="install-auto-files" class="flash-note">官网固定固件自动下载并核验，无需 ZIP、本地固件包或手选应用槽。</p>
    <p id="install-channel-scope" class="flash-note">本次精简固件不含独立 HTML 浏览器、PDF、应用中心、Lua 轻应用及开发者实验入口。本站 v2.0.8 浏览器体验与指南展示旧版能力。</p>
  </details>
  <details class="flash-details"><summary>查看检测结果与诊断</summary><pre id="install-detail" class="flash-target-details"></pre></details>`;

  const q = id => root.querySelector('#install-' + id);
  const names = {'clean-reinstall':'全新安装（清空内部数据）','dual-slot-update':'保留数据更新'};
  const effects = {'clean-reinstall':'erase-internal', 'first-install': 'initialize-blank', 'single-slot-migration': 'preserve-and-relocate', 'dual-slot-update': 'preserve'};
  const serialSupported = !!(globalThis.isSecureContext && navigator.serial);
  let policy = null, session = null, candidate = null, plan = null, backup = null, backupPlan = null, confirmation = null;
  let task = null, loadTask = null, closing = null, abort = null, generation = 0, uncertainOwner = null, pendingSelection = null;
  let backupSaved = false;
  let phase = 'loading', message = '', result = '', lastError = '', progressLabel = '', connected = false, writeStarted = false, recoveryAdvice = '';

  function snapshot() { return session?.snapshot() || null; }
  function uncertain() {
    const owner = uncertainOwner || session, state = owner?.snapshot();
    if (state?.portCloseUncertain) uncertainOwner = owner;
    else if (uncertainOwner && state?.phase === 'closed' && !state.busy && !state.connected) uncertainOwner = null;
    return !!uncertainOwner;
  }
  const active = () => !!task || !!loadTask || !!closing || !!pendingSelection;
  const available = () => !!policy?.enabled;
  const recognizedPlan = () => !!plan && !!names[plan.mode] && plan.dataEffect === effects[plan.mode] && plan.backupRequired === (plan.mode === 'single-slot-migration') && (plan.mode !== 'clean-reinstall' || plan.destructive === true) && /^[a-f0-9]{64}$/i.test(plan.sha256 || '');
  const readyPlan = () => recognizedPlan() && plan.executable === true;
  const canBackup = () => recognizedPlan() && plan.backupAllowed === true;
  const dataImpact = () => plan?.executable === false
    ? '当前只允许读取并保存备份，不会重建分区或搬移数据。'
    : plan?.mode === 'clean-reinstall'
      ? '清空全部 16 MiB 内部 Flash，包括内部设置、阅读进度和文件。TF/SD 卡不改动。备份可选，未备份的内部数据将无法恢复。'
    : plan?.mode === 'first-install'
      ? '执行前完整只读扫描全片；发现任何已有数据即停止，不会擦写。全片空白才安装匹配底座与应用。'
      : plan?.mode === 'single-slot-migration'
        ? '迁移会重建分区并等长搬移内部存储，保留 NVS 与校准数据。不是掉电原子操作：必须先保存并核验完整备份，再执行迁移。'
        : '写入非启动槽，完整读回通过后才提交启动记录；保留原启动槽、底座、设置和内部存储。无需强制整片备份。';

  // Keep raw controller codes in diagnostics; explain common stops at the point of action.
  function explainError(error) {
    const raw = error?.message || String(error || '');
    const cases = [
      [/PORT_CLOSE_UNCERTAIN|SERIAL_(?:OPEN_STILL_PENDING|CLOSE_TIMEOUT)/i, '原串口尚未确认关闭。', '请再次尝试断开设备；确认关闭前不能重新连接。'],
      [/UNKNOWN_LAYOUT|UNKNOWN_PARTITION|BLANK_FLASH_NOT_EMPTY/i, '设备分区或现有数据不符合已登记布局，已停止写入。', '请核对原固件和对应分区资料，由设备负责人确认恢复方案；不要猜测地址刷写。'],
      [/WL_.*(?:CRC|PARTIAL|NONCONTIGUOUS|INCOMPLETE|STATES_DIFFER|BOUNDS|COLLISION)|FAT_(?!.*UNSUPPORTED)/i, '内部存储完整性检查未通过，无法安全迁移。', '请先保存只读完整备份，再由设备负责人检查或恢复内部存储；不要格式化后重试。'],
      [/WL_|FAT_.*UNSUPPORTED|MIGRATION_STORAGE_INCOMPATIBLE/i, '内部存储格式或几何尚未通过迁移验证。', '写入保持关闭。若允许只读备份，请先保存备份并等待匹配的迁移支持。'],
      [/BOOTLOADER_CONTRACT_MISMATCH/i, '设备底座尚未登记为此固件的兼容版本。', '请保留原设备状态，核对底座版本并联系维护方；不要自行更换底座或跳过检查。'],
      [/OTA_UNCONFIRMED_BOOT|NEW[ /_-]*PENDING|PENDING_VERIFY/i, '上一次升级尚未完成首次启动确认。', '请按原固件说明先完成启动检查或恢复，再重新连接；当前不覆盖应用槽。'],
      [/OTA_UNKNOWN_RECORD|OTA_NO_TRUSTED_SELECTION|OTA_SEQUENCE_EXHAUSTED/i, '启动选择记录无法安全判定。', '请保留备份并由设备负责人核对启动记录；不要手选应用槽继续刷写。'],
      [/SECURITY_(?:READ_FAILED|EFUSE_READ_FAILED)/i, '安全状态读取失败，尚未获得写入授权。', '请查看诊断中的读取阶段与命令状态，检查数据线后重新连接；无需修改 eFuse。'],
      [/SECURITY_(?:INFO_FORMAT|UNKNOWN|RESERVED|EFUSE_MISMATCH|EFUSE_RESPONSE|EFUSE_FORMAT|ROM_PROOF)/i, '安全状态格式或交叉核验尚不支持，已停止写入。', '请保留诊断中的只读字段供维护方核对；这不表示设备一定开启了加密，不要修改 eFuse。'],
      [/SECURE_BOOT_ENABLED|SECURE_DOWNLOAD_ENABLED|FLASH_ENCRYPTION_ENABLED|ANTI_ROLLBACK/i, '设备的安全配置或已烧录安全版本与当前镜像不兼容，已停止写入。', '请使用匹配安全配置的官方维护流程；不要为刷机关闭保护或修改 eFuse。'],
      [/CANCELLED|AbortError|aborted|NotFoundError|No port selected/i, '操作已取消或未选择设备。', '需要继续时，重新检查固件并主动连接设备，重新检测后操作。'],
      [/STUB_HANDOFF|STUB_MEM_END|Serial data stream stopped|No serial data received|Invalid head of packet|Invalid SLIP escape/i, '设备通信或下载模式握手未完成。', '本次没有获得可用的连接；请保持数据线与供电，关闭原会话后重连。可在诊断中查看 connection.stage 和 lastOpcode；这不表示设备启用了安全保护。'],
      [/DEVICE_DISCONNECTED|DISCONNECTED|device has been lost|NetworkError|SERIAL.*(?:READ|WRITE)/i, '设备连接已中断。', '请检查供电与数据线，断开旧会话后重新连接；如已开始写入，请按备份恢复说明处理。'],
      [/Written.*(?:SHA|MD5)|readback.*mismatch/i, '写入区域的读回校验未通过。', '安装尚未完成。请保留完整备份，断开设备后按对应固件包的恢复说明处理。'],
      [/Owner download SHA|download.*(?:length|limit)|Trusted download|DOWNLOAD|Failed to fetch|fetch failed|下载失败/i, '官网固件下载失败或文件校验未通过。', '请检查网络后重新点击“连接并刷机”；持续失败请联系维护方。'],
      [/16MiB|ESP32-S3 required|16 MiB/i, '芯片或闪存容量不符合此固件要求。', '请核对官网指定机型，不要继续刷写。']
    ];
    const match = cases.find(([pattern]) => pattern.test(raw));
    return match ? {title: match[1], advice: match[2]} : {title: /[\u4e00-\u9fff]/.test(raw) ? raw : '设备或固件检查未通过，操作已停止。', advice: '请查看下方诊断中的原始原因，核对对应固件包说明后再重试。'};
  }
  function blockedExplanation() {
    const detail = plan?.storageProof?.reason || '';
    const info = explainError(`${plan?.blockedReason || 'PLAN_NOT_EXECUTABLE'} ${detail}`);
    return `${info.title}${info.advice}`;
  }

  function clearConfirmation() { confirmation = null; }
  function invalidatePlan() { plan = null; clearConfirmation(); backup = null; backupPlan = null; backupSaved = false; }
  function resetProgress(label = '') { q('progress').value = 0; progressLabel = label; }

  function render() {
    const busy = active(), held = uncertain();
    q('heading').textContent = held ? '端口关闭尚未确认' : phase === 'loading' ? '正在检查 paperspace 固件' : phase === 'failed' ? '操作未完成' : phase === 'complete' ? '写入与读回校验完成' : phase === 'blocked' ? '设备已识别，写入暂未开放' : !policy?.enabled ? '官网固件暂不可用' : `paperspace 固件 · ${policy.target?.version || ''}`;
    q('status').textContent = pendingSelection && !task ? '请先在浏览器设备选择窗口中完成选择或取消；原选择未结束前不能再次连接。' : held ? '当前页仍保留原端口所有权，禁止重新连接。请尝试“断开设备”；未确认关闭前不能视为安全结束。' : message || policy?.reason || '请检查网络后重试。';
    q('target').textContent = policy?.target ? `官网指定机型：${policy.target.board} / ${policy.target.model}；目标版本：${policy.target.version}。` : '尚无可核验的官网固件包，设备连接与写入保持关闭。';
    q('browser').textContent = serialSupported ? '使用数据线与桌面 Chrome / Edge，点击后选择本设备串口。' : !globalThis.isSecureContext ? '设备连接需要 HTTPS 或 localhost 安全页面，请在安全地址打开。' : '当前浏览器不支持 Web Serial。请使用桌面 Chrome / Edge 打开此页后连接。';
    q('result').textContent = result;
    if (recoveryAdvice) q('recovery').textContent = `${plan ? '本次计划' : '上次计划'}恢复说明：${recoveryAdvice} 取消、断开或离开本页会使确认失效；已经擦写的区域不会自动恢复。`;
    q('reload').disabled = busy || connected || held;
    q('connect').disabled = busy || connected || held || !available() || !serialSupported;
    q('connect').textContent = busy ? (phase === 'writing' ? '正在刷入与校验…' : '正在连接并准备刷入…') : '连接并刷机';
    q('backup-connect').disabled = busy || connected || held || !available() || !serialSupported;
    q('plan').textContent = plan ? '本次安装方式：'+names[plan.mode]+'。' : '选择设备后自动检查、获取官网固件并刷入；兼容双槽保留数据更新。';
    q('blocked').hidden = !plan || plan.executable !== false;
    q('blocked').textContent = plan?.executable === false ? blockedExplanation() : '';
    q('impact').hidden = !plan;
    q('impact').textContent = plan ? dataImpact() : '';
    q('backup').disabled = busy || held || !connected || !canBackup() || typeof globalThis.showSaveFilePicker !== 'function';
    q('warnings').replaceChildren();
    for (const warning of (plan?.mode === 'clean-reinstall' ? ['全片传输与读回可能需要数分钟，请保持供电和 USB 连接。'] : plan?.warnings || [])) { const li = document.createElement('li'); li.textContent = String(warning); q('warnings').append(li); }
    q('warnings').hidden = !q('warnings').childElementCount;
    const saveSupported = typeof globalThis.showSaveFilePicker === 'function';
    q('cancel').disabled = !!closing || (!task && !loadTask);
    q('disconnect').disabled = !!closing || (!connected && !task && !held);
    q('backup-info').textContent = plan?.backupRequired && !saveSupported ? '当前浏览器无法验证文件保存完成，迁移暂不可执行。请使用支持文件保存接口的桌面 Chrome / Edge。' : backupSaved ? '完整备份已保存到本机，并按原摘要回读核验。' : backup ? '完整备份已读取，保存尚未完成；尚未开始刷写，可重试保存。' : '';
    q('progress-label').textContent = progressLabel || '等待连接设备。';
    q('detail').textContent = JSON.stringify({installerBuild:'paperspace-one-click-serial-1',phase, target: policy?.target || null, plan, backupReceipt: backup?.receipt || null, device: snapshot(), error: lastError, deviceTesting: '未完成真机验证', bootHealthVerified: false}, null, 2);
  }

  function progress(event, token) {
    if (token !== generation) return;
    const p = event || {}, stage = p.stage || '';
    const total = p.total ?? p.totalBytes;
    let done = p.receivedBytes ?? p.verifiedBytes ?? p.bytesRead ?? p.completedBytes ?? p.acknowledgedBytes;
    if (phase === 'writing') {
      if (stage === 'blank-scan') progressLabel = '正在完整只读扫描 16 MiB，确认全 FF 前不擦写。';
      else if (p.verified === true) progressLabel = '写入区域读回 SHA-256 校验通过；尚未验证实际启动。';
      else if (/readback|sha|verif/i.test(stage)) progressLabel = '正在读回并核验写入区域 SHA-256；尚未完成。';
      else { progressLabel = '设备 ACK：已接收写入数据；SHA-256 读回验证尚未完成。'; if (Number.isFinite(total) && done >= total) progressLabel = '设备 ACK 已收齐；正在等待完整读回与 SHA-256 验证。'; }
    } else if (phase === 'backing-up') progressLabel = '正在读取并保存完整备份；关闭文件并回读核验后才显示保存成功。';
    else progressLabel = '正在下载并核验官网指定固件。';
    if (Number.isFinite(total) && total > 0 && Number.isFinite(done)) q('progress').value = Math.min(100, Math.max(0, done / total * 100));
    else q('progress').removeAttribute('value');
    q('progress-label').textContent = progressLabel;
  }

  function failure(error) {
    lastError = error?.message || String(error); phase = 'failed'; confirmation = null;
    connected = !!snapshot()?.connected; candidate = null;
    const info = explainError(error);
    message = info.title + info.advice;
    progressLabel = writeStarted ? '写入未完成或未通过验证，请保留备份并按原包说明恢复。' : '本次操作未完成，未获得可用的安装确认。';
    result = writeStarted ? '若已开始擦写，相关区域不会自动回滚。请勿把 ACK 或部分写入当作安装成功；单槽迁移请保留本机备份，并按对应恢复说明处理。' : info.advice + (connected ? ' 请先断开当前设备会话。' : '');
    invalidatePlan();
  }

  async function run(action) {
    if (active()) return;
    const token = generation; abort = new AbortController();
    let accept, reject;
    const pending = new Promise((resolve, fail) => { accept = resolve; reject = fail; });
    task = pending; render();
    // Lock before the synchronous action; preserve the click for port/file pickers.
    try { Promise.resolve(action(token, abort.signal)).then(accept, reject); } catch (error) { reject(error); }
    try { await pending; } catch (error) { if (token === generation) { if (/AbortError|NotFoundError|No port selected|CANCELLED_PORT_SELECTION/.test(error?.name+' '+error?.message)) { phase='cancelled';lastError='';message='已取消设备选择或本次操作，未开始新的刷写。'; } else failure(error); } }
    finally { if (task === pending) task = null; render(); }
  }

  async function reload() {
    if (active() || connected || uncertain()) return;
    const token = ++generation; policy = null; candidate = null; session = null; invalidatePlan();
    lastError = ''; result = ''; writeStarted = false;
    phase = 'loading'; message = '读取官网固定的固件身份；此步骤不会申请串口权限。'; resetProgress('正在检查官网固件。'); abort = new AbortController();
    const pending = (async () => {
      const loaded = await loadOwnerPolicy({signal: abort.signal}); if (token !== generation) return;
      policy = loaded;
      if (!policy.enabled) { phase = 'disabled'; message = policy.reason || '固件包尚未就绪，暂不开放设备连接。'; resetProgress('固件包未就绪，连接与写入保持关闭。'); return; }
      phase='ready';message=serialSupported?'连接后自动检查并刷入官网固件。':'请使用支持 Web Serial 的桌面浏览器。';resetProgress('等待连接设备。');
    })();
    loadTask = pending; render();
    try { await pending; } catch (error) { if (token === generation) { candidate = null; failure(error); } }
    finally { if (loadTask === pending) loadTask = null; render(); }
  }

  async function closeSession(owner = session) {
    if (!owner) return;
    try { await owner.disconnect(); } catch (error) { lastError=error?.message||String(error); }
    connected=!!owner.snapshot()?.connected;uncertain();
  }
  function startConnection(install = true) {
    if (active() || connected || uncertain() || !available() || !serialSupported) return;
    generation++;invalidatePlan();candidate=null;result='';lastError='';writeStarted=false;
    void run(async (token,signal) => {
      const owner=session=createController({policy});
      try {
        // requestPort is reached synchronously in this click, before any await or download.
        const connection=owner.connectFromUserGesture({board:policy.target.board,model:policy.target.model});
        pendingSelection=connection;
        Promise.resolve(connection).then(()=>{if(pendingSelection===connection)pendingSelection=null;render();},()=>{if(pendingSelection===connection)pendingSelection=null;render();});
        const download=owner.loadCandidate({signal,onProgress:event=>progress(event,token)});
        phase='connecting';message=install?'请选择设备，随后自动检查并刷入。':'请选择设备；本次仅连接与备份，不会刷写。';resetProgress('正在连接设备并获取官网固件。');render();
        const [,loaded]=await abortable(Promise.all([connection,download]),signal);
        if(token!==generation||signal.aborted)throw new DOMException('操作已取消','AbortError');
        connected=!!owner.snapshot()?.connected;candidate=loaded;
        const device=owner.snapshot()?.device;
        let prepared;
        if (!install || device && (device.layout!=='dual'||!device.bootloaderMatched||!device.ota?.safe)) prepared=await owner.prepare(candidate,{mode:'clean-reinstall'});
        else { try { prepared=await owner.prepare(candidate,{mode:'auto'}); } catch(error) { if(token!==generation||!owner.snapshot()?.connected)throw error;prepared=await owner.prepare(candidate,{mode:'clean-reinstall'}); } }
        if(token!==generation||signal.aborted)throw new DOMException('操作已取消','AbortError');
        plan=prepared;if(!readyPlan())throw Error('设备没有通过本次安装计划检查，禁止写入。');
        recoveryAdvice=plan.recovery||'';clearConfirmation();phase='connected';
        if(install){const written=await performWrite(plan,token,signal);if(!written){await closeSession(owner);invalidatePlan();candidate=null;}}
        else {message='只读连接已完成。点击高级选项中的“保存完整备份”；本次不会刷写。';resetProgress('等待保存可选备份。');}
      } catch(error) {
        owner.cancel();await closeSession(owner);throw error;
      }
    });
  }
  q('connect').addEventListener('click',()=>startConnection(true));
  q('backup-connect').addEventListener('click',()=>startConnection(false));

  function checkpoint(token, signal, p) {
    if (token !== generation || signal.aborted || plan !== p || !connected || uncertain()) throw new DOMException('操作已取消', 'AbortError');
  }
  function abortable(pending, signal) {
    return new Promise((resolve, reject) => {
      const cancel = () => { signal.removeEventListener('abort', cancel); reject(new DOMException('操作已取消', 'AbortError')); };
      signal.addEventListener('abort', cancel, {once: true});
      if (signal.aborted) { cancel(); return; }
      Promise.resolve(pending).then(value => { signal.removeEventListener('abort', cancel); if (!signal.aborted) resolve(value); }, error => { signal.removeEventListener('abort', cancel); reject(error); });
    });
  }
  async function performWrite(p, token, signal) {
    checkpoint(token, signal, p);
    if (!readyPlan()) throw new Error('当前计划没有写入授权。');
    if (p.destructive && !window.confirm('全新安装会清空全部 16 MiB 内部数据，包括设置、阅读进度和文件。TF/SD 卡不改动；独立 PMU 中的屏幕 VCOM 标定不清除，备份可选；未备份的数据无法恢复。\n\n固件尚未经真机验证。请保持供电与 USB 连接；中断可能无法启动，需要重新进入下载模式重装。\n\n确认清空内部数据并开始安装？')) { phase='cancelled';message='已拒绝清空内部数据，未发送擦写命令。';return false; }
    checkpoint(token, signal, p);
    confirmation = session.confirm(p, {installAccepted: true, destructiveAccepted:p.destructive === true, backupSaved, backupSha256: backup?.receipt.sha256});
    phase = 'writing'; writeStarted = true; message = '正在执行自动选择的范围，请保持供电与连接。'; resetProgress(p.mode === 'first-install' ? '先完整只读扫描全片；确认全 FF 后才写入。' : '正在准备刷写与读回验证。'); render();
    const response = await session.execute(p, confirmation, {signal, onProgress: event => progress(event, token)});
    checkpoint(token, signal, p); confirmation = null;
    if (response?.verified !== true || response?.md5Verified !== true || response?.readbackSha256 !== p.sha256 || (p.mode === 'dual-slot-update' && (response.bootSelectionChanged !== true || response.otaCommitPerformed !== true))) throw new Error('未收到完整写入与读回校验结果，不能确认完成。');
    phase = 'complete'; message = '写入与读回 SHA-256 校验已完成，实际启动与显示仍需设备检查。';
    result = p.mode === 'dual-slot-update' ? '非启动槽与启动选择已校验，保留原底座与原启动应用。请断开并启动设备检查。' : '匹配底座、应用与分区已校验，目标为 ota_0。请断开并启动设备检查。';
    if (backup) backup = {receipt: backup.receipt};
    resetProgress('读回校验通过；真实启动健康未验证。'); q('progress').value = 100;return true;
  }
  async function saveNecessaryBackup(p, token, signal, installAfter = p.backupRequired) {
    if (!canBackup() || typeof globalThis.showSaveFilePicker !== 'function') throw new Error('当前无法验证必要备份保存完成，迁移未执行。');
    let writer = null, closed = false, executing = false;
    backupSaved = false; clearConfirmation(); phase = 'backing-up'; message = installAfter ? '先保存并核验完整备份，再迁移。' : '仅保存可选完整备份，本次不会刷写。'; render();
    // The picker is called before the first await in this click action.
    const picked = globalThis.showSaveFilePicker({suggestedName: 'paperspace-full-backup.bin', types: [{description: '完整 Flash 备份', accept: {'application/octet-stream': ['.bin']}}]});
    try {
      const handle = await abortable(picked, signal); checkpoint(token, signal, p);
      let b = backupPlan === p && backup?.bytes instanceof Uint8Array ? backup : await session.backup(p, {signal, onProgress: event => progress(event, token)});
      checkpoint(token, signal, p);
      if (!(b.bytes instanceof Uint8Array) || b.bytes.length !== 16777216 || b.receipt.bytes !== b.bytes.length || b.receipt.planId !== p.id || !/^[a-f0-9]{64}$/i.test(b.receipt.sha256)) throw new Error('完整备份回执无效。');
      backup = b; backupPlan = p;
      writer = await abortable(handle.createWritable(), signal); checkpoint(token, signal, p);
      await abortable(writer.write(b.bytes), signal); checkpoint(token, signal, p);
      await abortable(writer.close(), signal); closed = true; checkpoint(token, signal, p);
      const file = await abortable(handle.getFile(), signal); checkpoint(token, signal, p);
      if (file.size !== b.bytes.length) throw new Error('保存的备份长度不符。');
      const savedBytes = await abortable(file.arrayBuffer(), signal); checkpoint(token, signal, p);
      const digest = await abortable(crypto.subtle.digest('SHA-256', savedBytes), signal); checkpoint(token, signal, p);
      const savedSha = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
      if (savedSha !== b.receipt.sha256) throw new Error('保存的备份摘要不符。');
      backupSaved = true;
      if (installAfter && p.executable) { executing = true; await performWrite(p, token, signal); }
      else { phase = p.executable ? 'connected' : 'blocked'; message = '完整备份已保存到本机并回读核验，尚未刷写。'; resetProgress(message); }
    } catch (error) {
      if (executing || signal.aborted || token !== generation || !session?.snapshot()?.connected) throw error;
      backupSaved = false; confirmation = null; phase = p.executable ? 'connected' : 'blocked'; lastError = error?.message || String(error);
      message = '备份未完成保存与核验，未开始刷写。可以重试备份，或在干净重装时自行决定是否继续。'; resetProgress(message);
    } finally {
      if (writer && !closed) { try { await writer.abort(); } catch {} }
    }
  }
  q('backup').addEventListener('click',()=>void run(async(token,signal)=>{
    const p=plan;checkpoint(token,signal,p);
    try { await saveNecessaryBackup(p,token,signal,false); }
    finally { if(token===generation){const saved=backupSaved;await closeSession();invalidatePlan();candidate=null;if(saved){phase='ready';message='完整备份已保存并回读核验。现在可点击“连接并刷机”。';result=message;}} }
  }));

  async function stop(disconnect = false) {
    if (closing) return;
    const completed = phase === 'complete';
    generation++; abort?.abort(); session?.cancel(); confirmation = null;
    const pending = Promise.allSettled([task, loadTask]);
    message = '正在停止后续命令并关闭原会话；已经擦写的区域不会回滚。';
    const done = (async () => {
      await pending;
      if (disconnect || session || uncertain()) {
        const owner = uncertainOwner || session;
        try { await owner?.disconnect(); } catch (error) { lastError = error?.message || String(error); }
        connected = !!owner?.snapshot()?.connected;
        uncertain(); candidate = null; invalidatePlan();
      }
      phase = completed ? 'complete' : 'cancelled';
      message = uncertain() ? '原端口关闭仍未确认，当前页继续禁止重连。请再次尝试断开原会话。' : completed ? '设备已断开。写入与读回校验已完成，实际启动健康仍未验证。' : '会话已停止，可重新点击“连接并刷机”。旧授权不可复用。';
      if (!completed) {
        progressLabel = writeStarted ? '写入已停止，已写区域不会自动恢复；请保留完整备份。' : '当前操作已停止。';
        if (writeStarted) result = '安装没有完成。请保留本机备份，按对应固件包的恢复说明处理。';
      }
    })();
    closing = done; render(); try { await done; } finally { if (closing === done) closing = null; render(); }
  }

  q('cancel').addEventListener('click', () => void stop());
  q('disconnect').addEventListener('click', () => void stop(true));
  q('reload').addEventListener('click', () => void reload());
  navigator.serial?.addEventListener('disconnect', () => { if (connected || (task && phase !== 'loading')) void stop(true); });
  window.addEventListener('hashchange', () => { if (location.hash !== '#flash' && (connected || task || loadTask || uncertain())) void stop(true); });
  window.addEventListener('beforeunload', event => { if (active() || connected || uncertain()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { generation++; abort?.abort(); session?.cancel(); void (uncertainOwner || session)?.disconnect().catch(() => {}); });
  window.addEventListener('pageshow', event => { if (event.persisted) void stop(true); });
  window.PaperspaceInstaller = Object.freeze({snapshot: () => ({phase, message, result, connected, portCloseUncertain: uncertain(), targetEnabled: !!policy?.enabled, candidateReady: !!candidate, busy: active(), confirmationReady: !!confirmation, planMode: plan?.mode || null, error: lastError})});
  void reload();
}
