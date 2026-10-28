/* Production USB installer only. Device access starts in its explicit user gesture. */
let started=false;
function start(){
 if(started||location.hash!=='#flash')return;const outer=document.getElementById('flash-root');if(!outer)return;started=true;
 outer.innerHTML='<section class="flash-shell"><div class="flash-heading"><p class="eyebrow">FIRMWARE UPDATE</p><h1>连接设备，<br>自动刷入官网固件。</h1><p>点击“连接并刷机”并选择设备即可。全新安装会明确确认清空内部数据，备份可选。</p></div><div id="flash-real-root"></div></section>';
 import('./real-flasher-ui.js?v=20261028-dual-upgrade-1').catch(()=>{
  const root=document.getElementById('flash-real-root');if(!root)return;root.replaceChildren();
  const p=document.createElement('p');p.setAttribute('role','alert');p.textContent='安装工具加载失败，尚未连接或刷写。请检查网络后重新载入。';
  const b=document.createElement('button');b.className='flash-button';b.textContent='重新载入页面';b.addEventListener('click',()=>location.reload());root.append(p,b);
 });
}
window.addEventListener('hashchange',start);start();
