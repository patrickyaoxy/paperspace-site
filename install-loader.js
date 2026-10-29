/* Production USB installer only. Device access starts in its explicit user gesture. */
let started=false;
function start(){
 if(started||location.hash!=='#flash')return;const outer=document.getElementById('flash-root');if(!outer)return;started=true;
 outer.innerHTML='<section class="flash-shell"><div class="flash-heading"><p class="eyebrow">FIRMWARE UPDATE</p><h1>连接设备，<br>自动刷入官网固件。</h1><p>点击“连接并刷机”并选择设备即可。全新安装会明确确认清空内部数据，备份可选。</p></div><section class="sd-section" id="firmware-download" aria-labelledby="firmware-download-title"><div class="sd-callout"><div><p class="eyebrow">MANUAL INSTALL / 自行刷机</p><h2 id="firmware-download-title">完整固件 .bin，下载后直接刷入。</h2><p>v2.1.1 stable 精简版 · Read Pico ESP32-S3 / 16MB。只需一个文件，烧录起始地址 <strong>0x0</strong>。</p><p class="sd-scope">完整重装会覆盖全部 16 MiB 内部 Flash，包括原系统、设置、进度和内部文件；TF/SD 卡不动。保留数据升级请用下方“连接并刷机”。公开测试构建，真机安装尚未验证。</p></div><div class="sd-actions"><a class="button sd-download" id="firmware-package-download" href="downloads/paperspace-v2.1.1-stable-esp32s3-full.bin" download>下载完整固件 .bin <span>↓</span></a><span class="sd-package-meta">v2.1.1 · 16,777,216 字节 · 起始地址 0x0</span><a href="firmware/v2.1.1/INSTALL.zh.txt">烧录工具与说明 ↗</a><details><summary>SHA-256 与下载接口</summary><p class="sd-details"><code>53af29d3e7dec8d0511c2c81fbfb676e7b23325035b778e6240ad6ae0e640e3e</code><br><a href="downloads/paperspace-v2.1.1-stable-esp32s3-full.bin.sha256" download>下载校验文件</a> · <a href="firmware-download.json">机器可读下载信息 JSON</a><br>本文件已合并启动、分区、应用和 OTA 记录，间隙为 0xFF，属于完整重装。<br><a href="legal.html">许可与匹配重链接材料</a></p></details></div></div></section><div id="flash-real-root"></div></section>';
 import('./real-flasher-ui.js?v=20261029-ota-download-1').catch(()=>{
  const root=document.getElementById('flash-real-root');if(!root)return;root.replaceChildren();
  const p=document.createElement('p');p.setAttribute('role','alert');p.textContent='安装工具加载失败，尚未连接或刷写。请检查网络后重新载入。';
  const b=document.createElement('button');b.className='flash-button';b.textContent='重新载入页面';b.addEventListener('click',()=>location.reload());root.append(p,b);
 });
}
window.addEventListener('hashchange',start);start();
