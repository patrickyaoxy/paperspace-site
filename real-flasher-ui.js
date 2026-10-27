/* paperspace installation UI. Only the fixed-policy controller can access a device. */
import {loadOwnerPolicy, createController} from './real-flash/engine.js?v=20261027-flash208-1';

const root = document.getElementById('flash-real-root');
if (root) {
  root.innerHTML = `<div class="flash-target-status" role="status" aria-live="polite">
    <strong id="install-heading">正在检查 paperspace 固件</strong><p id="install-status"></p>
    <button id="install-reload" class="flash-button">重新检查固件 / 重试下载</button>
  </div>
  <p class="flash-note install-beta">公开测试版（Public Beta）· 尚未完成真机验证。写入校验通过不代表设备已正常启动。</p>
  <ol class="flash-steps install-steps">
    <li><span>01</span><h2>连接并自动检测</h2>
      <p>自动检查芯片、16 MiB 容量、安全状态与分区，推荐本机可用的安装方式。未知布局不会写入。</p>
      <p id="install-target" class="flash-note">正在核对官网指定的机型与固件。</p>
      <p class="flash-note">连接会尝试重启设备进入下载模式，请先保存阅读进度并退出正在进行的传输；读回校验不能替代启动验收。</p>
      <label class="flash-inject"><input id="install-model" type="checkbox" disabled><span>我已核对设备确为上述机型。芯片识别不能证明板型。</span></label>
      <button id="install-connect" class="flash-button" disabled>连接设备并检测</button>
      <p id="install-browser" class="flash-note"></p>
    </li>
    <li><span>02</span><h2>备份与必要确认</h2>
      <p id="install-plan">连接后自动显示推荐方式与数据影响，无需手选应用槽。</p>
      <p id="install-blocked" class="flash-note install-blocked" role="status" hidden></p>
      <div id="install-impact" class="flash-warning install-impact" hidden></div>
      <ul id="install-warnings" class="install-warnings" hidden></ul>
      <p class="flash-note">每次安装均需先保存 16 MiB 完整备份，双槽更新也一样。备份只保存到你的电脑，不上传；发起下载不等于已经保存或验证可恢复。</p>
      <button id="install-backup" class="flash-button" disabled>读取并保存完整备份</button>
      <a id="install-backup-download" class="flash-button" hidden download>重新保存本机备份</a>
      <p id="install-backup-info" class="flash-note"></p>
      <div id="install-confirmation-fields" hidden>
        <label class="flash-inject"><input id="install-saved" type="checkbox" disabled><span id="install-saved-label">我已保存完整备份，并理解本次安装的数据影响。</span></label>
        <label class="flash-select">输入下方确认文字<span id="install-phrase-hint"></span><input id="install-phrase" autocomplete="off" spellcheck="false" autocapitalize="off" disabled></label>
        <button id="install-confirm" class="flash-button" disabled>确认本次安装计划</button>
      </div>
    </li>
    <li><span>03</span><h2>写入与验证</h2>
      <p>仅执行本次确认的范围。先等待设备 ACK，再读取写入区域并核验 SHA-256；两者分别显示。</p>
      <button id="install-write" class="flash-button flash-primary" disabled>开始安装</button>
      <p id="install-progress-label" class="flash-note" role="status" aria-live="polite">等待设备检测与备份确认。</p>
      <progress id="install-progress" value="0" max="100" aria-label="当前阶段进度"></progress>
      <p id="install-result" class="flash-note" role="status" aria-live="polite"></p>
    </li>
  </ol>
  <div class="flash-actions"><button id="install-cancel" class="flash-button" disabled>取消当前操作</button><button id="install-disconnect" class="flash-button" disabled>断开设备</button></div>
  <p id="install-recovery" class="flash-note">取消、断开或离开本页会使本次确认失效；已经擦写的区域不会自动恢复。请保留完整备份，按对应固件包的恢复说明处理。TF 卡文件不能代替设备内部数据备份。</p>
  <details class="flash-details"><summary>查看检测结果与诊断</summary><pre id="install-detail" class="flash-target-details"></pre></details>`;

  const q = id => root.querySelector('#install-' + id);
  const names = {'first-install': '新机首次安装', 'single-slot-migration': '单槽迁移至双槽', 'dual-slot-update': '双槽更新'};
  const effects = {'first-install': 'initialize-blank', 'single-slot-migration': 'preserve-and-relocate', 'dual-slot-update': 'preserve'};
  const serialSupported = !!(globalThis.isSecureContext && navigator.serial);
  let policy = null, session = null, candidate = null, plan = null, backup = null, backupPlan = null, confirmation = null;
  let task = null, loadTask = null, closing = null, abort = null, generation = 0, backupURL = null, uncertainOwner = null;
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
  const recognizedPlan = () => !!plan && !!names[plan.mode] && plan.dataEffect === effects[plan.mode] && plan.backupRequired === true && /^[a-f0-9]{64}$/i.test(plan.sha256 || '') && typeof plan.confirmationPhrase === 'string' && !!plan.confirmationPhrase;
  const readyPlan = () => recognizedPlan() && plan.executable === true;
  const canBackup = () => recognizedPlan() && (readyPlan() || plan.backupAllowed === true);
  const canConfirm = () => readyPlan() && !!backup && backupPlan === plan && backup.receipt.planId === plan.id;
  const dataImpact = () => plan?.executable === false
    ? '当前设备已识别，但没有通过写入授权检查。不会重建分区或搬移数据。以下为待验证方案的影响说明，不能作为已获准迁移的承诺。'
    : plan?.mode === 'first-install'
    ? '首次安装会创建新的分区与空白内部存储。安装前仍需保存完整备份；不要把新布局当作原数据的恢复。'
    : plan?.mode === 'single-slot-migration'
      ? '迁移会重建分区，并搬移已确认兼容的内部存储，保留 NVS 与校准数据。这不是原子操作：中断可能损坏布局或丢失数据，必须先保存完整备份。'
      : '双槽更新保留内部存储与设置，目标应用槽由检测结果确定。断电或中断仍可能需要恢复，必须先保存完整备份。';
  const acceptance = () => plan?.mode === 'first-install'
    ? '我已保存完整备份，并接受首次安装会创建新的分区与空白内部存储。'
    : plan?.mode === 'single-slot-migration'
      ? '我已保存完整备份，并理解迁移将重建分区、搬移内部存储；中断可能损坏布局或丢失数据，恢复须按原包说明执行。'
      : '我已保存完整备份，并理解双槽更新中断仍可能需要恢复。';

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
      [/Secure\/encrypted|eFuse|SECURITY|FLASH_ENCRYPT|SECURE_BOOT/i, '设备安全或加密状态不在支持范围内。', '连接已停止。请核对设备来源与安全配置，不要为刷机修改安全设置。'],
      [/CANCELLED|AbortError|aborted|NotFoundError|No port selected/i, '操作已取消或未选择设备。', '需要继续时，重新检查固件并主动连接设备，重新备份和确认。'],
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

  function clearConfirmation() { confirmation = null; q('saved').checked = false; q('phrase').value = ''; }
  function invalidatePlan() { plan = null; clearConfirmation(); }
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
    q('model').disabled = busy || connected || !available() || !serialSupported || held;
    q('connect').disabled = busy || connected || held || !available() || !serialSupported || !q('model').checked;
    q('connect').textContent = phase === 'connecting' ? '正在连接与检测…' : '连接设备并检测';
    q('plan').textContent = plan ? `${plan.executable === false ? '已识别方案（暂不可写）' : '自动推荐'}：${names[plan.mode] || '无法授权的计划'}。` : '连接后自动显示推荐方式与数据影响，无需手选应用槽。';
    q('blocked').hidden = !plan || plan.executable !== false;
    q('blocked').textContent = plan?.executable === false ? blockedExplanation() + (canBackup() ? '当前仅开放只读备份。' : '当前不开放设备读写操作。') : '';
    q('impact').hidden = !plan;
    q('impact').textContent = plan ? dataImpact() + (plan.impact ? '\n' + plan.impact : '') : '';
    q('warnings').replaceChildren();
    for (const warning of plan?.warnings || []) { const li = document.createElement('li'); li.textContent = String(warning); q('warnings').append(li); }
    q('warnings').hidden = !q('warnings').childElementCount;
    q('backup').disabled = busy || held || !connected || !canBackup() || ['complete', 'failed'].includes(phase);
    q('backup').textContent = phase === 'backing-up' ? '正在读取备份…' : plan?.executable === false ? '只读备份并保存' : '读取并保存完整备份';
    q('confirmation-fields').hidden = !canConfirm() || phase === 'complete';
    q('saved').disabled = busy || held || !connected || !canConfirm() || ['complete', 'failed'].includes(phase);
    q('saved-label').textContent = acceptance();
    q('phrase').disabled = q('saved').disabled;
    q('phrase-hint').textContent = plan?.confirmationPhrase || '';
    q('confirm').disabled = q('saved').disabled || !q('saved').checked || q('phrase').value !== plan?.confirmationPhrase || !!confirmation;
    q('write').disabled = busy || held || !connected || !confirmation;
    q('write').textContent = phase === 'writing' ? '正在写入与验证…' : '开始安装';
    q('cancel').disabled = !!closing || (!task && !loadTask);
    q('disconnect').disabled = !!closing || (!connected && !task && !held);
    q('backup-info').textContent = backup ? '16 MiB 完整备份已读取。请检查本机下载记录，确保文件已保存；摘要见下方诊断。' : '';
    q('progress-label').textContent = progressLabel || '等待设备检测与备份确认。';
    q('detail').textContent = JSON.stringify({phase, target: policy?.target || null, plan, backupReceipt: backup?.receipt || null, device: snapshot(), error: lastError, deviceTesting: '未完成真机验证', bootHealthVerified: false}, null, 2);
  }

  function progress(event, token) {
    if (token !== generation) return;
    const p = event || {}, stage = p.stage || '';
    const total = p.total ?? p.totalBytes;
    let done = p.receivedBytes ?? p.verifiedBytes ?? p.bytesRead ?? p.completedBytes ?? p.acknowledgedBytes;
    if (phase === 'writing') {
      if (p.verified === true) progressLabel = '写入区域读回 SHA-256 校验通过；尚未验证实际启动。';
      else if (/readback|sha|verif/i.test(stage)) progressLabel = '正在读回并核验写入区域 SHA-256；尚未完成。';
      else { progressLabel = '设备 ACK：已接收写入数据；SHA-256 读回验证尚未完成。'; if (Number.isFinite(total) && done >= total) progressLabel = '设备 ACK 已收齐；正在等待完整读回与 SHA-256 验证。'; }
    } else if (phase === 'backing-up') progressLabel = '正在读取完整备份并校验数据；尚未保存到本机。';
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
    result = writeStarted ? '已经擦写的区域不会自动回滚。请勿把 ACK 或部分写入当作安装成功；保留本机备份，按对应固件包的恢复说明处理。' : info.advice + (connected ? ' 请先断开当前设备会话。' : '');
    invalidatePlan();
  }

  async function run(action) {
    if (active()) return;
    const token = generation; abort = new AbortController();
    const pending = (async () => action(token, abort.signal))(); task = pending; render();
    try { await pending; } catch (error) { if (token === generation) failure(error); }
    finally { if (task === pending) task = null; render(); }
  }

  async function reload() {
    if (active() || connected || uncertain()) return;
    const token = ++generation; policy = null; candidate = null; session = null; invalidatePlan();
    q('model').checked = false; lastError = ''; result = ''; writeStarted = false;
    phase = 'loading'; message = '读取官网固定的固件身份；此步骤不会申请串口权限。'; resetProgress('正在检查官网固件。'); abort = new AbortController();
    const pending = (async () => {
      const loaded = await loadOwnerPolicy({signal: abort.signal}); if (token !== generation) return;
      policy = loaded;
      if (!policy.enabled) { phase = 'disabled'; message = policy.reason || '固件包尚未就绪，暂不开放设备连接。'; resetProgress('固件包未就绪，连接与写入保持关闭。'); return; }
      session = createController({policy}); message = '正在下载并核验官网指定固件包，完成后才可连接。'; render();
      const loadedCandidate = await session.loadCandidate({signal: abort.signal, onProgress: p => progress(p, token)});
      if (token !== generation) return;
      candidate = loadedCandidate; phase = 'ready'; message = serialSupported ? '固件已核验。确认机型后连接，系统将检测布局并推荐安装方式。' : '固件已核验，请使用支持 Web Serial 的桌面浏览器与安全地址连接。'; resetProgress('固件包已核验，等待连接设备。');
    })();
    loadTask = pending; render();
    try { await pending; } catch (error) { if (token === generation) { candidate = null; failure(error); } }
    finally { if (loadTask === pending) loadTask = null; render(); }
  }

  q('connect').addEventListener('click', () => run(async token => {
    if (uncertain()) throw new Error('PORT_CLOSE_UNCERTAIN：原端口尚未确认关闭，禁止重连。');
    if (!available() || !serialSupported || !q('model').checked) throw new Error('请等待官网固件核验完成，并确认实际机型。');
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
      phase = 'connected'; message = `检测完成，推荐“${names[plan.mode]}”。请阅读数据影响，先保存完整备份。`; resetProgress('设备已检测，等待读取完整备份。');
    }
  }));

  q('backup').addEventListener('click', () => run(async (token, signal) => {
    if (!connected || !canBackup() || uncertain()) throw new Error('当前设备没有获准读取备份的计划。');
    clearConfirmation(); phase = 'backing-up'; message = '正在读取 16 MiB 完整备份，请保持连接。备份不会上传。'; resetProgress('正在读取完整备份。'); render();
    const b = await session.backup(plan, {signal, onProgress: p => progress(p, token)}); if (token !== generation) return;
    if (!(b.bytes instanceof Uint8Array) || b.bytes.length !== 16777216 || b.receipt.bytes !== b.bytes.length || b.receipt.planId !== plan.id || !/^[a-f0-9]{64}$/i.test(b.receipt.sha256)) throw new Error('完整备份校验回执无效，禁止确认安装。');
    const url = URL.createObjectURL(new Blob([b.bytes], {type: 'application/octet-stream'}));
    if (backupURL) URL.revokeObjectURL(backupURL); backupURL = url; backup = b; backupPlan = plan;
    const link = q('backup-download'); link.href = url; link.download = `paperspace-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.bin`; link.hidden = false; link.click();
    phase = readyPlan() ? 'backed-up' : 'blocked'; message = readyPlan() ? '完整备份已读取并发起本机下载。请核实文件确已保存，再确认数据影响与安装计划。' : '只读完整备份已读取并发起本机下载。请核实文件确已保存；当前仍不开放确认与写入。' + blockedExplanation(); resetProgress('备份读取与摘要校验完成；请检查本机下载。'); q('progress').value = 100;
  }));

  q('confirm').addEventListener('click', () => {
    try {
      if (active() || uncertain() || !connected || !canConfirm() || !q('saved').checked || q('phrase').value !== plan.confirmationPhrase) return;
      confirmation = session.confirm(plan, {phrase: q('phrase').value, backupSha256: backup.receipt.sha256, backupSaved: true});
      phase = 'confirmed'; message = '本次设备、备份与安装计划已确认。点击“开始安装”才会写入。';
    } catch (error) { failure(error); }
    render();
  });

  q('write').addEventListener('click', () => run(async (token, signal) => {
    if (!connected || !confirmation || !readyPlan() || uncertain()) throw new Error('请先完成当前会话的备份与确认。');
    phase = 'writing'; writeStarted = true; message = '正在执行确认的安装范围。请保持供电，不要拔线或关闭页面。'; resetProgress('正在准备写入；尚未通过读回验证。'); render();
    const response = await session.execute(plan, confirmation, {signal, onProgress: p => progress(p, token)}); if (token !== generation) return;
    confirmation = null;
    if (response?.verified !== true || response?.md5Verified !== true || response?.readbackSha256 !== plan.sha256 || (plan.mode === 'dual-slot-update' && (response.bootSelectionChanged !== true || response.otaCommitPerformed !== true))) throw new Error('未收到完整写入与读回校验结果，不能确认完成。');
    phase = 'complete'; message = '写入与读回 SHA-256 校验已完成。实际启动、屏幕显示与个人数据仍需在设备上检查。';
    result = plan.mode === 'dual-slot-update' ? '已按本次计划更新启动选择，未验证启动健康。请按固件包说明断开并启动设备，检查显示和数据。' : '匹配底座、应用与分区写入已校验，计划启动目标为 ota_0；未验证启动健康。请按固件包说明断开并启动设备，检查显示和数据。';
    resetProgress('写入区域读回 SHA-256 校验通过；实际启动健康未验证。'); q('progress').value = 100;
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
      message = uncertain() ? '原端口关闭仍未确认，当前页继续禁止重连。请再次尝试断开原会话。' : completed ? '设备已断开。写入与读回校验已完成，实际启动健康仍未验证。' : '会话已停止。重新检查固件后，再连接、检测、备份并确认。旧确认不可复用。';
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
  q('model').addEventListener('change', () => { invalidatePlan(); render(); });
  q('saved').addEventListener('change', () => { confirmation = null; render(); });
  q('phrase').addEventListener('input', () => { confirmation = null; render(); });
  navigator.serial?.addEventListener('disconnect', () => { if (connected || (task && phase !== 'loading')) void stop(true); });
  window.addEventListener('hashchange', () => { if (location.hash !== '#flash' && (connected || task || loadTask || uncertain())) void stop(true); });
  window.addEventListener('beforeunload', event => { if (active() || connected || uncertain()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { generation++; abort?.abort(); session?.cancel(); void (uncertainOwner || session)?.disconnect().catch(() => {}); });
  window.addEventListener('pageshow', event => { if (event.persisted) void stop(true); });
  window.PaperspaceInstaller = Object.freeze({snapshot: () => ({phase, message, result, connected, portCloseUncertain: uncertain(), targetEnabled: !!policy?.enabled, candidateReady: !!candidate, busy: active(), confirmationReady: !!confirmation, planMode: plan?.mode || null, error: lastError})});
  void reload();
}
