'use strict';
// The below-fold studio has no runtime or image dependencies on the landing view.
(()=>{
 const section=document.getElementById('customize'),button=document.getElementById('customize-load'),status=document.getElementById('customize-load-status');
 if(!section||!button)return;
 let loading=false,loaded=false,attempt=0;
 async function load(){
  if(loading||loaded)return;loading=true;button.disabled=true;status.textContent='正在打开搭配演示…';
  try{
   await new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='widgets-customize.css?v=2-native';link.onload=resolve;link.onerror=()=>{link.remove();reject(Error('style'));};document.head.append(link);});
   const studio=await import(`./widgets-customize.js?v=2-native&attempt=${attempt++}`);studio.mount(section);loaded=true;
  }catch{status.textContent='演示未能加载，下面的操作说明仍可阅读。请检查网络后重试。';button.disabled=false;button.textContent='重试打开演示 ↻';}
  finally{loading=false;}
 }
 button.addEventListener('click',load);
 if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting)){observer.disconnect();load();}},{rootMargin:'240px'});observer.observe(section);}
})();
