// Browser UI wiring only; controller/serial protocol are covered separately.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=new URL('../',import.meta.url),out=process.argv[2];assert.ok(out,'Pass a new report directory');await mkdir(out);
const sha=b=>createHash('sha256').update(b).digest('hex');
const fake=`
const s=window.scenario;window.calls=[];let connected=false;const mode=s.mode||'dual-slot-update';
const p={id:'test',mode,sha256:'a'.repeat(64),backupRequired:mode==='single-slot-migration',backupAllowed:true,executable:!s.blocked,dataEffect:({'first-install':'initialize-blank','single-slot-migration':'preserve-and-relocate','dual-slot-update':'preserve'})[mode]};
export async function loadOwnerPolicy(){return{enabled:true,target:{board:'TEST',model:'MEMORY',version:'2.1.1'}};}
export function createController(){return{
async loadCandidate(){return{}},async connectFromUserGesture(){calls.push('connect');connected=true},async prepare(){return p},
async backup(){calls.push('backup');const bytes=new Uint8Array(16777216);const digest=await crypto.subtle.digest('SHA-256',bytes);return{bytes,receipt:{bytes:bytes.length,planId:p.id,sha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')}}},
confirm(plan,opts){calls.push('confirm');if(p.backupRequired&&(!opts.backupSaved||!calls.includes('closed')||!calls.includes('read-file')))throw Error('UNSAVED_BACKUP');return{}},
async execute(plan,c,{signal,onProgress}){calls.push('execute');onProgress({stage:'stub-received-ack',acknowledgedBytes:1,total:1});if(s.delayedWrite)await new Promise(r=>window.releaseWrite=r);if(s.writeFailure)throw Error('Written readback SHA-256 mismatch');return{verified:!s.incomplete,md5Verified:true,readbackSha256:p.sha256,bootSelectionChanged:true,otaCommitPerformed:true}},
cancel(){calls.push('cancel');window.releaseWrite?.()},async disconnect(){calls.push('disconnect');connected=!!s.held},snapshot(){return{connected,portCloseUncertain:!!s.held&&calls.includes('disconnect')}}};}`;
const server=createServer(async(req,res)=>{try{res.setHeader('Content-Type','text/javascript');if(req.url==='/test'){res.setHeader('Content-Type','text/html');res.end('<div id="flash-real-root"></div><script type="module" src="/real-flasher-ui.js"></script>');}else res.end(await readFile(new URL('real-flasher-ui.js',root)));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const checks=[];
async function ui(scenario){const context=await browser.newContext();await context.addInitScript(s=>{
 window.scenario=s;Object.defineProperty(navigator,'serial',{value:{addEventListener(){}}});
 if(s.noSave)Object.defineProperty(window,'showSaveFilePicker',{value:undefined});else window.showSaveFilePicker=async()=>{
 calls.push('picker');window.pickerActivation=navigator.userActivation.isActive;
 if(s.cancelPicker)throw new DOMException('cancel','AbortError');
 if(s.latePicker)await new Promise(r=>window.releasePicker=r);
 let bytes;
 return{async createWritable(){calls.push('create');return{async write(b){calls.push('write-file');if(s.failWrite)throw Error('SAVE_WRITE_FAILED');bytes=b.slice();},async close(){calls.push('close-start');if(s.delayClose)await new Promise(r=>window.releaseClose=r);if(s.failClose)throw Error('SAVE_CLOSE_FAILED');calls.push('closed')},async abort(){calls.push('abort-file')}}},async getFile(){calls.push('read-file');if(s.badSize)return{size:1};return{size:bytes.length,arrayBuffer:async()=>{const b=bytes.slice();if(s.corrupt)b[0]^=1;return b.buffer;}}}};
 };
},scenario);const page=await context.newPage();await page.route('**/real-flash/engine.js*',r=>r.fulfill({contentType:'text/javascript',body:fake}));await page.goto('http://127.0.0.1:'+server.address().port+'/test#flash');await page.waitForFunction(()=>window.PaperspaceInstaller&&!PaperspaceInstaller.snapshot().busy);await page.locator('#install-connect').click();await page.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);return{context,page};}
async function run(id,s,body){const{page,context}=await ui(s);try{await body(page);checks.push({id,status:'PASS'});}catch(e){checks.push({id,status:'FAIL',error:e.stack});throw e;}finally{await context.close();}}
const click=async p=>{await p.locator('#install-write').click();await p.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);};
const calls=p=>p.evaluate(()=>window.calls);
try{
 for(const mode of ['dual-slot-update','first-install'])await run('ONE_BUTTON_NO_BACKUP_'+mode,{mode},async p=>{assert.equal(await p.locator('#install-model,#install-backup,#install-confirm,#install-saved,#install-phrase').count(),0);await click(p);assert.deepEqual(await calls(p),['connect','confirm','execute']);assert.equal(await p.evaluate(()=>PaperspaceInstaller.snapshot().phase),'complete');});
 await run('SINGLE_SAVE_CLOSE_READBACK_BEFORE_EXECUTE',{mode:'single-slot-migration'},async p=>{await click(p);assert.deepEqual(await calls(p),['connect','picker','backup','create','write-file','close-start','closed','read-file','confirm','execute']);assert.equal(await p.evaluate(()=>pickerActivation),true);});
 for(const key of ['cancelPicker','failWrite','failClose','badSize','corrupt'])await run('SINGLE_'+key,{mode:'single-slot-migration',[key]:true},async p=>{await click(p);assert.equal((await calls(p)).includes('execute'),false);assert.equal((await calls(p)).includes('confirm'),false);assert.equal(await p.locator('#install-write').isEnabled(),true);});
 await run('SINGLE_SAVE_API_ABSENT',{mode:'single-slot-migration',noSave:true},async p=>assert.equal(await p.locator('#install-write').isDisabled(),true));
 await run('SINGLE_BLOCKED_BACKUP_ONLY',{mode:'single-slot-migration',blocked:true},async p=>{await click(p);assert.equal((await calls(p)).includes('read-file'),true);assert.equal((await calls(p)).includes('execute'),false);});
 await run('SINGLE_CANCEL_DURING_CLOSE_NO_LATE_WRITE',{mode:'single-slot-migration',delayClose:true},async p=>{await p.locator('#install-write').click();await p.waitForFunction(()=>calls.includes('close-start'));await p.locator('#install-cancel').click();await p.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);await p.evaluate(()=>releaseClose());assert.equal((await calls(p)).includes('confirm'),false);assert.equal((await calls(p)).includes('execute'),false);});
 await run('SINGLE_LATE_PICKER_NO_WRITE',{mode:'single-slot-migration',latePicker:true},async p=>{await p.locator('#install-write').click();await p.locator('#install-cancel').click();await p.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);await p.evaluate(()=>releasePicker());assert.equal((await calls(p)).includes('backup'),false);assert.equal((await calls(p)).includes('execute'),false);});
 await run('SINGLE_DUPLICATE_CLICK_ONE_EXECUTE',{mode:'single-slot-migration',delayClose:true},async p=>{await p.evaluate(()=>{const b=document.querySelector('#install-write');b.dispatchEvent(new MouseEvent('click'));b.dispatchEvent(new MouseEvent('click'));});await p.waitForFunction(()=>calls.includes('close-start'));assert.equal((await calls(p)).filter(x=>x==='picker').length,1);await p.evaluate(()=>releaseClose());await p.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);assert.equal((await calls(p)).filter(x=>x==='execute').length,1);});
 await run('CANCEL_ACK_LATE_RESULT_IGNORED',{delayedWrite:true},async p=>{await p.locator('#install-write').click();await p.waitForFunction(()=>calls.includes('execute'));assert.equal(await p.evaluate(()=>PaperspaceInstaller.snapshot().phase),'writing');await p.locator('#install-cancel').click();await p.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);assert.equal(await p.evaluate(()=>PaperspaceInstaller.snapshot().phase),'cancelled');});
 for(const key of ['incomplete','writeFailure'])await run('WRITE_FAILURE_'+key,{[key]:true},async p=>{await click(p);assert.equal(await p.evaluate(()=>PaperspaceInstaller.snapshot().phase),'failed');});
}finally{await browser.close();await new Promise(r=>server.close(r));await writeFile(out+'/report.json',JSON.stringify({checks,uiSha256:sha(await readFile(new URL('real-flasher-ui.js',root))),runnerSha256:sha(await readFile(new URL(import.meta.url))),deviceAccess:false,scope:'UI mocked controller; real browser FileSystem API simulated; not hardware'},null,2)+'\n');console.log(JSON.stringify({passed:checks.filter(x=>x.status==='PASS').length,total:checks.length}));}
