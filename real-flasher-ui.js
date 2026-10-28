/* paperspace installation UI. Only the fixed-policy controller can access a device. */
import {loadOwnerPolicy, createController} from './real-flash/engine.js?v=20261028-security-flow-1';

const root = document.getElementById('flash-real-root');
if (root) {
  root.innerHTML = `<div class="flash-target-status" role="status" aria-live="polite">
    <strong id="install-heading">正在检查 paperspace 固件</strong><p id="install-status"></p>
    <button id="install-reload" class="flash-button">重新检查固件 / 重试下载</button>
  </div>
  <p class="flash-note install-beta">v2.1.1 正式渠道精简构建 · 云端测试候选，尚未完成真机验证。写入校验通过不代表设备已正常启动。</p>
  <p id="install-auto-files" class="flash-note">USB 安装自动获取并核验官网固定固件，无需下载 ZIP、选择本地固件包或手选应用槽。</p>
  <p id="install-channel-scope" class="flash-note">此安装目标不含独立 HTML 浏览器、PDF、应用中心与 Lua 轻应用，以及开发者实验入口。本站 v2.0.8 浏览器体验、原帧和轻应用指南展示旧版能力，不代表本次精简构建。折叠的本地预检仍限 v2.0.8；2.1.1 使用此固定安装入口。</p>
  <p id="install-scope" class="flash-warning">仅对已登记单槽布局及兼容 WL/FAT12 存储，软件验证已覆盖含子目录迁移；真机未验证。仅单槽重叠迁移必须先保存完整备份；中断后可能需借助外部工具按原布局恢复，网页无自动恢复。</p>
  <ol class="flash-steps install-steps">
    <li><span>01</span><h2>连接并自动检测</h2>
      <p>自动检查芯片、16 MiB 容量、安全状态与分区，仅支持已登记的精确布局。未知布局、未登记的旧双槽 bootloader 均拒绝写入。</p>
      <p id="install-target" class="flash-note">正在核对官网指定的机型与固件。</p>
      <p class="flash-note">连接会尝试重启设备进入下载模式，请先保存阅读进度并退出正在进行的传输；读回校验不能替代启动验收。</p>
      <p class="flash-note">仅连接上述适用机型；芯片识别不能证明实际板型。</p>
      <button id="install-connect" class="flash-button" disabled>连接设备并检测</button>
      <p id="install-browser" class="flash-note"></p>
    </li>
    <li><span>02</span><h2>自动选择安全路径</h2>
      <p id="install-plan">连接后自动显示方案与数据影响，无需手选应用槽。</p>
      <p id="install-blocked" class="flash-note install-blocked" role="status" hidden></p>
      <div id="install-impact" class="flash-warning install-impact" hidden></div>
      <ul id="install-warnings" class="install-warnings" hidden></ul>
      <p class="flash-note">受信双槽更新保留原启动槽与内部数据，无需强制下载整片备份；新机首次安装先完整只读扫描 16 MiB，确认全 FF 后才写入。单槽重叠迁移必须先把完整备份保存到本机并回读核验。</p>
      <p id="install-backup-info" class="flash-note"></p>
    </li>
    <li><span>03</span><h2>写入与验证</h2>
      <p>仅执行本次确认的范围。先等待设备 ACK，再读取写入区域并核验 SHA-256；两者分别显示。</p>
      <button id="install-write" class="flash-button flash-primary" disabled>开始安装</button>
      <p id="install-progress-label" class="flash-note" role="status" aria-live="polite">连接后可刷机；必要备份由同一按钮完成。</p>
      <progress id="install-progress" value="0" max="100" aria-label="当前阶段进度"></progress>
      <p id="install-result" class="flash-note" role="status" aria-live="polite"></p>
    </li>
  </ol>
  <div class="flash-actions"><button id="install-cancel" class="flash-button" disabled>取消当前操作</button><button id="install-disconnect" class="flash-button" disabled>断开设备</button></div>
  <p id="install-recovery" class="flash-note">取消、断开或离开本页会使本次授权失效；已经擦写的区域不会自动恢复。单槽迁移请保留完整备份；其他中断按对应固件与原布局的恢复说明处理。TF 卡文件不能代替设备内部数据备份。</p>
  <details class="flash-details"><summary>查看检测结果与诊断</summary><pre id="install-detail" class="flash-target-details"></pre></details>`;

  const q = id => root.querySelector('#install-' + id);
  const names = {'first-install': '新机首次安装', 'single-slot-migration': '单槽迁移至双槽', 'dual-slot-update': '双槽更新'};
  const effects = {'first-install': 'initialize-blank', 'single-slot-migration': 'preserve-and-relocate', 'dual-slot-update': 'preserve'};
  const serialSupported = !!(globalThis.isSecureContext && navigator.serial);
  let policy = null, session = null, candidate = null, plan = null, backup = null, backupPlan = null, confirmation = null;
  let task = null, loadTask = null, closing = null, abort = null, generation = 0, uncertainOwner = null;
  let backupSaved = false;
  let phase = 'loading', message = '', result = '', lastError = '', progressLabel = '', connected = false, writeStarted = false, recoveryAdvice = '';

  function snapshot() { return session?.snapshot() || null; }
  function uncertain() {
    const owner = uncertainOwner || session, state = owner?.snapshot();
    if (state?.portCloseUncertain) uncertainOwner = owner;
    else if (uncertainOwner && state?.phase === 'closed' && !state.busy && !state.connected) uncertainOwner = null;
    return !!uncertainOwner;
  }
  const active = () => !!task || !!loadTask || !!closing;
  const available = () => !!policy?.enabled && !!candidate;
  const recognizedPlan = () => !!plan && !!names[plan.mode] && plan.dataEffect === effects[plan.mode] && plan.backupRequired === (plan.mode === 'single-slot-migration') && /^[a-f0-9]{64}$/i.test(plan.sha256 || '');
  const readyPlan = () => recognizedPlan() && plan.executable === true;
  const canBackup = () => recognizedPlan() && plan.backupRequired && (readyPlan() || plan.backupAllowed === true);
  const dataImpact = () => plan?.executable === false
    ? '当前只允许读取并保存备份，不会重建分区或搬移数据。'
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
      [/SECURE_BOOT_ENABLED|SECURE_DOWNLOAD_ENABLED|FLASH_ENCRYPTION_ENABLED|ANTI_ROLLBACK/i, '设备确有当前镜像不兼容的安全保护，已停止写入。', '请使用匹配安全配置的官方维护流程；不要为刷机关闭保护或修改 eFuse。'],
      [/CANCELLED|AbortError|aborted|NotFoundError|No port selected/i, '操作已取消或未选择设备。', '需要继续时，重新检查固件并主动连接设备，重新检测后操作。'],
      [/DEVICE_DISCONNECTED|DISCONNECTED|device has been lost|NetworkError|SERIAL.*(?:READ|WRITE)/i, '设备连接已中断。', '请检查供电与数据线，断开旧会话后重新连接；如已开始写入，请按备份恢复说明处理。'],
      [/Written.*(?:SHA|MD5)|readback.*mismatch/i, '写入区域的读回校验未通过。', '安装尚未完成。请保留完整备份，断开设备后按对应固件包的恢复说明处理。'],
      [/Owner download SHA|download.*(?:length|limit)|Trusted download|DOWNLOAD|Failed to fetch|fetch failed|下载失败/i, '官网固件下载失败或文件校验未通过。', '设备连接保持关闭。请检查网络，点击“重新检查固件 / 重试下载”；持续失败请联系维护方。'],
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
    q('status').textContent = held ? '当前页仍保留原端口所有权，禁止重新连接。请尝试“断开设备”；未确认关闭前不能视为安全结束。' : message || policy?.reason || '请检查网络后重试。';
    q('target').textContent = policy?.target ? `官网指定机型：${policy.target.board} / ${policy.target.model}；目标版本：${policy.target.version}。` : '尚无可核验的官网固件包，设备连接与写入保持关闭。';
    q('browser').textContent = serialSupported ? '使用数据线与桌面 Chrome / Edge，点击后选择本设备串口。' : !globalThis.isSecureContext ? '设备连接需要 HTTPS 或 localhost 安全页面，请在安全地址打开。' : '当前浏览器不支持 Web Serial。请使用桌面 Chrome / Edge 打开此页后连接。';
    q('result').textContent = result;
    if (recoveryAdvice) q('recovery').textContent = `${plan ? '本次计划' : '上次计划'}恢复说明：${recoveryAdvice} 取消、断开或离开本页会使确认失效；已经擦写的区域不会自动恢复。`;
    q('reload').disabled = busy || connected || held;
    q('connect').disabled = busy || connected || held || !available() || !serialSupported;
    q('connect').textContent = phase === 'connecting' ? '正在连接与检测…' : '连接适用设备并检测';
    q('plan').textContent = plan ? `${plan.executable === false ? '已识别方案（暂不可写）' : '自动推荐'}：${names[plan.mode] || '无法授权的计划'}。` : '连接后自动显示推荐方式与数据影响，无需手选应用槽。';
    q('blocked').hidden = !plan || plan.executable !== false;
    q('blocked').textContent = plan?.executable === false ? blockedExplanation() + (canBackup() ? '当前仅开放只读备份。' : '当前不开放设备读写操作。') : '';
    q('impact').hidden = !plan;
    q('impact').textContent = plan ? dataImpact() + (plan.impact ? '\n' + plan.impact : '') : '';
    q('warnings').replaceChildren();
    for (const warning of plan?.warnings || []) { const li = document.createElement('li'); li.textContent = String(warning); q('warnings').append(li); }
    q('warnings').hidden = !q('warnings').childElementCount;
    const saveSupported = typeof globalThis.showSaveFilePicker === 'function';
    q('write').disabled = busy || held || !connected || !(readyPlan() || canBackup()) || ['complete', 'failed'].includes(phase) || (plan?.backupRequired && !saveSupported);
    q('write').textContent = phase === 'writing' ? '正在刷写与验证…' : phase === 'backing-up' ? '正在保存完整备份…' : plan?.executable === false ? '保存只读备份' : plan?.backupRequired ? '保存完整备份并迁移' : plan?.mode === 'first-install' ? '安装到空白设备' : '刷入官网固件';
    q('cancel').disabled = !!closing || (!task && !loadTask);
    q('disconnect').disabled = !!closing || (!connected && !task && !held);
    q('backup-info').textContent = plan?.backupRequired && !saveSupported ? '当前浏览器无法验证文件保存完成，迁移暂不可执行。请使用支持文件保存接口的桌面 Chrome / Edge。' : backupSaved ? '完整备份已保存到本机，并按原摘要回读核验。' : backup ? '完整备份已读取，保存尚未完成；当前尚未执行迁移，可重试保存。' : '';
    q('progress-label').textContent = progressLabel || '连接后可刷机；必要备份由同一按钮完成。';
    q('detail').textContent = JSON.stringify({phase, target: policy?.target || null, plan, backupReceipt: backup?.receipt || null, device: snapshot(), error: lastError, deviceTesting: '未完成真机验证', bootHealthVerified: false}, null, 2);
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
    } else if (phase === 'backing-up') progressLabel = '正在读取或保存必要备份；文件关闭并回读核验后才迁移。';
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
    try { await pending; } catch (error) { if (token === generation) failure(error); }
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
      session = createController({policy}); message = '正在下载并核验官网指定固件包，完成后才可连接。'; render();
      const loadedCandidate = await session.loadCandidate({signal: abort.signal, onProgress: p => progress(p, token)});
      if (token !== generation) return;
      candidate = loadedCandidate; phase = 'ready'; message = serialSupported ? '固件已核验。连接上述适用机型，检测后点击刷机即可；必要迁移备份由同一按钮完成。' : '固件已核验，请使用支持 Web Serial 的桌面浏览器与安全地址连接。'; resetProgress('固件包已核验，等待连接设备。');
    })();
    loadTask = pending; render();
    try { await pending; } catch (error) { if (token === generation) { candidate = null; failure(error); } }
    finally { if (loadTask === pending) loadTask = null; render(); }
  }

  q('connect').addEventListener('click', () => run(async token => {
    if (uncertain()) throw new Error('PORT_CLOSE_UNCERTAIN：原端口尚未确认关闭，禁止重连。');
    if (!available() || !serialSupported) throw new Error('请等待官网固件核验完成，并仅连接上述适用机型。');
    // Preserve the click's user activation: no await before requestPort inside the controller.
    const pending = session.connectFromUserGesture({board: policy.target.board, model: policy.target.model});
    phase = 'connecting'; message = '请选择设备串口。正在检查芯片、容量、安全状态与实际布局。'; resetProgress('连接与检测中；本阶段不发送闪存写入命令。'); render();
    await pending; if (token !== generation) return;
    connected = !!snapshot()?.connected;
    const prepared = await session.prepare(candidate, {mode: 'auto'}); if (token !== generation) return;
    plan = prepared;
    if (!recognizedPlan()) throw new Error('设备没有通过自动安装计划检查，禁止写入。');
    clearConfirmation(); recoveryAdvice = plan.recovery || ''; writeStarted = false;
    if (!readyPlan()) {
      phase = 'blocked'; lastError = [plan.blockedReason, plan.storageProof?.reason].filter(Boolean).join(': ');
      message = blockedExplanation(); resetProgress(canBackup() ? '写入未开放；可读取并保存完整备份。' : '写入未开放，请核对诊断与恢复说明。');
    } else {
      phase = 'connected'; message = `检测完成，推荐“${names[plan.mode]}”。请阅读数据影响后点击刷机。单槽迁移会先保存必要备份。`; resetProgress('设备已检测，可以执行上述安全路径。');
    }
  }));

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
    confirmation = session.confirm(p, {installAccepted: true, backupSaved, backupSha256: backup?.receipt.sha256});
    phase = 'writing'; writeStarted = true; message = '正在执行自动选择的范围，请保持供电与连接。'; resetProgress(p.mode === 'first-install' ? '先完整只读扫描全片；确认全 FF 后才写入。' : '正在准备刷写与读回验证。'); render();
    const response = await session.execute(p, confirmation, {signal, onProgress: event => progress(event, token)});
    checkpoint(token, signal, p); confirmation = null;
    if (response?.verified !== true || response?.md5Verified !== true || response?.readbackSha256 !== p.sha256 || (p.mode === 'dual-slot-update' && (response.bootSelectionChanged !== true || response.otaCommitPerformed !== true))) throw new Error('未收到完整写入与读回校验结果，不能确认完成。');
    phase = 'complete'; message = '写入与读回 SHA-256 校验已完成，实际启动与显示仍需设备检查。';
    result = p.mode === 'dual-slot-update' ? '非启动槽与启动选择已校验，保留原底座与原启动应用。请断开并启动设备检查。' : '匹配底座、应用与分区已校验，目标为 ota_0。请断开并启动设备检查。';
    if (backup) backup = {receipt: backup.receipt};
    resetProgress('读回校验通过；真实启动健康未验证。'); q('progress').value = 100;
  }
  async function saveNecessaryBackup(p, token, signal) {
    if (!canBackup() || typeof globalThis.showSaveFilePicker !== 'function') throw new Error('当前无法验证必要备份保存完成，迁移未执行。');
    let writer = null, closed = false, executing = false;
    backupSaved = false; clearConfirmation(); phase = 'backing-up'; message = p.executable ? '先保存并核验完整备份，再迁移；本次按钮操作已包含数据影响确认。' : '仅保存只读备份，不迁移。'; render();
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
      if (p.executable) { executing = true; await performWrite(p, token, signal); }
      else { phase = 'blocked'; message = '只读完整备份已保存并回读核验；当前不允许迁移。'; }
    } catch (error) {
      if (executing || signal.aborted || token !== generation || !session?.snapshot()?.connected) throw error;
      backupSaved = false; confirmation = null; phase = p.executable ? 'connected' : 'blocked'; lastError = error?.message || String(error);
      message = '备份未完成保存与核验，未执行迁移。可以重新点击保存。'; resetProgress(message);
    } finally {
      if (writer && !closed) { try { await writer.abort(); } catch {} }
    }
  }
  q('write').addEventListener('click', () => void run(async (token, signal) => {
    const p = plan; checkpoint(token, signal, p);
    if (!(readyPlan() || canBackup())) throw new Error('当前设备没有获准刷写或备份的计划。');
    if (p.backupRequired) await saveNecessaryBackup(p, token, signal);
    else await performWrite(p, token, signal);
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
      message = uncertain() ? '原端口关闭仍未确认，当前页继续禁止重连。请再次尝试断开原会话。' : completed ? '设备已断开。写入与读回校验已完成，实际启动健康仍未验证。' : '会话已停止。重新检查固件后，再连接与检测。旧授权不可复用。';
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
