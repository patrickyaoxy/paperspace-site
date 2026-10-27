/* Load failures remain visible; this file never accesses a device. */
let started=false;
function start(){if(started||location.hash!=='#flash')return;started=true;import('./real-flasher-ui.js?v=20261027-beta-enable-1').catch(()=>{
 const root=document.getElementById('flash-real-root');
 if(!root)return;
 root.replaceChildren();
 const p=document.createElement('p');p.setAttribute('role','alert');p.textContent='安装工具加载失败，设备连接与写入未开放。请检查完整文件与网络，再重新载入。';
 const b=document.createElement('button');b.className='flash-button';b.textContent='重新载入页面';b.addEventListener('click',()=>location.reload());root.append(p,b);
});}
window.addEventListener('hashchange',start);start();
