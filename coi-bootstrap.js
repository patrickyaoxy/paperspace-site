/* Establish browser isolation for the existing threaded WASM on static hosting. */
(()=>{
 if(crossOriginIsolated||!isSecureContext||!('serviceWorker' in navigator))return;
 const initiallyControlled=!!navigator.serviceWorker.controller;let requested=false;
 const reload=()=>{if(!initiallyControlled&&navigator.serviceWorker.controller&&!crossOriginIsolated&&!requested){requested=true;location.reload();}};
 navigator.serviceWorker.addEventListener('controllerchange',reload);
 navigator.serviceWorker.register(new URL('coi-serviceworker.js',document.currentScript.src),{scope:'./',updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready).then(reload).catch(()=>{});
})();
