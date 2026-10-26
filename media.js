'use strict';
// One delivery path for captured frames. Pending images never masquerade as failures.
(()=>{
 const generations=new WeakMap(),tasks=new WeakMap(),commits=new WeakMap();
 const source=url=>url.replace(/^assets\/screens\/(.+)\.png$/,'assets/screens-web/$1.webp');
 const active=img=>{const page=img.closest('[data-page]');const requested=location.hash.slice(1);const route=['experience','guide','flash'].includes(requested)?requested:'home';return (!page||page.dataset.page===route)&&!img.closest('[hidden]')&&!img.closest('details:not([open])');};
 const near=img=>{const r=img.getBoundingClientRect();return active(img)&&r.width>0&&r.height>0&&r.top<innerHeight+250&&r.bottom>-250;};
 function ready(img,url){const commit=commits.get(img);if(commit?.url===url){commits.delete(img);if(commit.alt!==undefined)img.alt=commit.alt;commit.onReady?.();}img.dispatchEvent(new CustomEvent('mediaready'));}
 async function load(img){
  const url=img.dataset.src;if(!url||!active(img))return false;
  if(img.getAttribute('src')===url&&img.naturalWidth){ready(img,url);return true;}
  if(tasks.get(img)?.url===url)return tasks.get(img).promise;
  const generation=(generations.get(img)||0)+1;generations.set(img,generation);
  const promise=(async()=>{
   const next=new Image();next.decoding='async';next.fetchPriority=img.fetchPriority||'auto';next.src=url;
   try{await next.decode();if(generations.get(img)!==generation||img.dataset.src!==url||!active(img))return false;img.src=url;ready(img,url);return true;}
   catch{if(generations.get(img)===generation&&img.dataset.src===url&&active(img)){img.dispatchEvent(new CustomEvent('mediaerror'));}return false;}
   finally{if(tasks.get(img)?.promise===promise)tasks.delete(img);}
  })();tasks.set(img,{url,promise});return promise;
 }
 const observer='IntersectionObserver'in window?new IntersectionObserver(entries=>{for(const item of entries)if(item.isIntersecting)load(item.target);},{rootMargin:'250px 0px'}):null;
 function set(img,url,{immediate=false,alt,onReady}={}){
  img.dataset.src=source(url);commits.set(img,{url:img.dataset.src,alt,onReady});img.decoding='async';observer?.observe(img);
  return immediate||near(img)?load(img):Promise.resolve(false);
 }
 function refresh(){document.querySelectorAll('img[data-src]').forEach(img=>{observer?.observe(img);if(near(img))load(img);});}
 window.PaperspaceMedia={set,load,refresh,source};
 document.querySelectorAll('img[data-src]').forEach(img=>{img.dataset.src=source(img.dataset.src);img.decoding='async';observer?.observe(img);});
 document.addEventListener('toggle',refresh,true);window.addEventListener('hashchange',refresh);
 if(!observer)window.addEventListener('scroll',refresh,{passive:true});
 refresh();
})();
