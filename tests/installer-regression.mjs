// Local-only browser regressions. No OS serial port is exposed or requested.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import http from 'node:http';
import {createRequire} from 'node:module';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const disabled = JSON.parse(await readFile(resolve(root, 'firmware-target.json')));
assert.equal(disabled.enabled, false, 'The live policy must remain disabled for this preparation batch');
assert.equal(disabled.target, null);
const files = {manifest: Buffer.from('{"synthetic_demo":true}'), bootloader: Buffer.alloc(32), partitionTable: Buffer.alloc(3072), app: Buffer.alloc(288), otaData: Buffer.alloc(8192, 255)};
const partitions = [['nvs',1,2,36864,20480],['phy_init',1,1,57344,4096],['ota_0',0,16,65536,5242880],['storage',1,129,5308416,5242880],['ota_1',0,17,10551296,5242880],['otadata',1,0,15794176,8192]];
const contract = {idfVersion:'v6.1',rollback:true,antiRollback:false};
const target = {board:'SYNTHETIC_TEST_BOARD',model:'MEMORY_ONLY',project:'paperspace',version:'2.0.8',idfVersion:'v6.1',sourceSha:'79f2f5ad303b9a588d551e3e0eb4b6e5735bc56b',manifest:{url:'vectors/manifest',sha256:hash(files.manifest),bytes:files.manifest.length},images:{},partitions,knownLayouts:[],bootloaderContract:contract,acceptedBootloaders:[]};
for (const [role,address] of Object.entries({app:65536,bootloader:0,partitionTable:32768,otaData:15794176})) target.images[role]={file:role+'.bin',url:'vectors/'+role,sha256:hash(files[role]),bytes:files[role].length,address};
const enabled = {schema:3,enabled:true,unavailable_reason:'',target};
const knownTable=await readFile(resolve(root,'compatibility/v1.6.16-single-slot/partition-table.bin'));
const knownLayout={id:'v1_6_16_exact_single',kind:'single',partitionSha256:hash(knownTable),partitions:[['nvs',1,2,36864,20480],['phy_init',1,1,57344,4096],['factory',0,0,65536,6291456],['storage',1,129,6356992,5242880]],storageMigration:{method:'byte-copy',format:'esp-idf-wl-fat',sectorSize:4096,sourceLabel:'storage',targetLabel:'storage'}};
let policy = disabled, corrupt = false;
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  try {
    if(url.pathname==='/policy-test') {res.setHeader('Content-Type','text/html');res.end('<script type="module">import * as engine from "/real-flash/engine.js"; window.engine=engine;</script>');return;}
    if(url.pathname==='/ui-test') {res.setHeader('Content-Type','text/html');res.end('<div id="flash-real-root"></div><script type="module" src="/real-flasher-ui.js"></script>');return;}
    if(url.pathname==='/firmware-target.json') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(policy));return;}
    if(url.pathname.startsWith('/vectors/')) {const key=url.pathname.split('/').pop();const bytes=files[key];res.end(corrupt && key==='app' ? Buffer.alloc(bytes.length,1) : bytes);return;}
    const path=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!path.startsWith(root+'/')) throw Error('outside root');
    res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/plain');res.end(await readFile(path));
  } catch {res.statusCode=404;res.end('not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const checks=[];
async function check(id,run) {try {await run();checks.push({id,status:'PASS'});}catch(error){checks.push({id,status:'FAIL',error:String(error)});throw error;}}
const fakeEngine = `
const scenario=window.__scenario;let connected=false,closed=false,held=false;
const plan={id:'mock-plan',mode:scenario.mode||'dual-slot-update',dataEffect:({'first-install':'initialize-blank','single-slot-migration':'preserve-and-relocate','dual-slot-update':'preserve'})[scenario.mode||'dual-slot-update'],sha256:'a'.repeat(64),backupRequired:true,backupAllowed:true,executable:scenario.blocked!==true,blockedReason:scenario.blocked?'WL_FORMAT_UNVERIFIED':null,confirmationPhrase:'TEST ONLY',warnings:['内存交互夹具'],storageProof:scenario.blocked?{reason:'FAT_TYPE_UNSUPPORTED'}:null};
window.calls=[];let resolveWrite;
export async function loadOwnerPolicy(){return {enabled:scenario.disabled!==true,target:{board:'MEMORY',model:'MOCK',version:'2.0.8'}};}
export function createController(){return {
async loadCandidate(){calls.push('loadCandidate');if(scenario.downloadFailure)throw Error('Owner download SHA-256: app');return {};},
async connectFromUserGesture(){calls.push('connect');connected=true;closed=false;},
async prepare(){calls.push('prepare');if(scenario.reject)throw Error(scenario.reject);return plan;},
async backup(){calls.push('backup');return {bytes:new Uint8Array(16777216),receipt:{bytes:16777216,planId:scenario.badBackup?'wrong':plan.id,sha256:'b'.repeat(64)}};},
confirm(){calls.push('confirm');return {};},
async execute(p,c,{onProgress}){calls.push('execute');onProgress({acknowledgedBytes:100,total:100,stage:'stub-received-ack',verified:false});if(scenario.delayed){await new Promise(r=>resolveWrite=r);}if(scenario.writeFailure)throw Error('Written flash readback SHA-256 mismatch');return {verified:!scenario.incomplete,md5Verified:true,readbackSha256:plan.sha256,bootSelectionChanged:true,otaCommitPerformed:true};},
cancel(){calls.push('cancel');resolveWrite?.();},
async disconnect(){calls.push('disconnect');held=scenario.held===true;connected=held;closed=!held;return this.snapshot();},
snapshot(){return {connected,portCloseUncertain:held,phase:closed?'closed':connected?'ready':'idle',busy:false};}
};}`;
async function ui(scenario={}) {
  const context=await browser.newContext({acceptDownloads:true});
  await context.addInitScript(s=>{window.__scenario=s;Object.defineProperty(navigator,'serial',{value:{addEventListener(){},requestPort(){throw Error('REAL SERIAL FORBIDDEN');}}});},scenario);
  const page=await context.newPage();
  await page.route('**/real-flash/engine.js*',route=>route.fulfill({contentType:'text/javascript',body:fakeEngine}));
  await page.goto(origin+'/ui-test#flash');
  await page.waitForFunction(()=>window.PaperspaceInstaller && !window.PaperspaceInstaller.snapshot().busy);
  return {page,context};
}
async function connect(page){await page.locator('#install-model').check();await page.locator('#install-connect').click();await page.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);}
async function backupConfirm(page){await page.locator('#install-backup').click();await page.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);await page.locator('#install-saved').check();await page.locator('#install-phrase').fill('TEST ONLY');await page.locator('#install-confirm').click();}
try {
  const page=await browser.newPage();await page.goto(origin+'/policy-test');await page.waitForFunction(()=>window.engine);
  const load=()=>page.evaluate(async()=>{try {const p=await engine.loadOwnerPolicy();return {enabled:p.enabled,target:p.target};}catch(e){return {error:e.message};}});
  await check('POLICY-DISABLED',async()=>assert.deepEqual(await load(),{enabled:false,target:null}));
  await check('POLICY-UNAUTHENTICATED',async()=>assert.match(await page.evaluate(()=>{try{engine.createController({policy:{enabled:true}});}catch(e){return e.message;}}),/UNAUTHENTICATED_OWNER_POLICY/));
  await check('POLICY-PINNED-DOWNLOAD',async()=>{policy=structuredClone(enabled);assert.equal((await load()).enabled,true);assert.equal(await page.evaluate(async()=>{const p=await engine.loadOwnerPolicy();const c=engine.createController({policy:p});return (await c.loadCandidate()).source;}),'OWNER_PINNED_RAW_IMAGES');});
  await check('POLICY-BAD-HASH',async()=>{corrupt=true;assert.match(await page.evaluate(async()=>{try{const p=await engine.loadOwnerPolicy();await engine.createController({policy:p}).loadCandidate();}catch(e){return e.message;}}),/Owner download SHA-256/);corrupt=false;});
  await check('POLICY-EXACT-KNOWN-SINGLE',async()=>{policy=structuredClone(enabled);policy.target.knownLayouts=[structuredClone(knownLayout)];assert.equal((await load()).enabled,true);});
  await check('POLICY-KNOWN-STORAGE-SIZE',async()=>{policy=structuredClone(enabled);policy.target.knownLayouts=[structuredClone(knownLayout)];policy.target.knownLayouts[0].partitions[3][4]-=4096;assert.match((await load()).error,/MIGRATION_STORAGE_INCOMPATIBLE/);});
  await check('POLICY-KNOWN-NVS-CHANGED',async()=>{policy=structuredClone(enabled);policy.target.knownLayouts=[structuredClone(knownLayout)];policy.target.knownLayouts[0].partitions[0][4]-=4096;assert.match((await load()).error,/MIGRATION_UNKNOWN_DATA_REGION/);});
  for(const [id,mutate,pattern] of [
    ['POLICY-UNKNOWN-FIELDS',p=>p.extra=true,/Unexpected\/missing/],
    ['POLICY-SOURCE-MISMATCH',p=>p.target.sourceSha='0'.repeat(40),/Unreviewed release identity/],
    ['POLICY-PARTITION-MISMATCH',p=>p.target.partitions[3][4]=4096,/six-partition/],
    ['POLICY-UNREVIEWED-BOOTLOADER',p=>p.target.bootloaderContract.rollback=false,/rollback bootloader contract/],
    ['POLICY-UNSAFE-URL',p=>p.target.images.app.url='../outside.bin',/safe relative/],
    ['POLICY-IMAGE-GEOMETRY',p=>p.target.images.app.address=0xa10000,/geometry/],
  ]) await check(id,async()=>{policy=structuredClone(enabled);mutate(policy);assert.match((await load()).error,pattern);});
  await page.close();policy=disabled;
  await check('UI-DISABLED-NO-CONNECTION',async()=>{const {page,context}=await ui({disabled:true});assert.equal(await page.locator('#install-connect').isDisabled(),true);assert.deepEqual(await page.evaluate(()=>calls),[]);await context.close();});
  await check('UI-DOWNLOAD-FAILURE',async()=>{const {page,context}=await ui({downloadFailure:true});assert.equal(await page.locator('#install-connect').isDisabled(),true);assert.match(await page.locator('#install-status').textContent(),/下载失败/);await context.close();});
  for(const mode of ['first-install','single-slot-migration','dual-slot-update']) await check('UI-CONFIRM-'+mode,async()=>{const {page,context}=await ui({mode});assert.equal(await page.locator('#install-connect').isDisabled(),true);await connect(page);assert.equal(await page.locator('#install-write').isDisabled(),true);await backupConfirm(page);assert.equal(await page.locator('#install-write').isEnabled(),true);await page.locator('#install-phrase').fill('changed');assert.equal(await page.locator('#install-write').isDisabled(),true);assert.equal((await page.evaluate(()=>calls)).includes('execute'),false);await context.close();});
  await check('UI-BLOCKED-BACKUP-ONLY',async()=>{const {page,context}=await ui({mode:'single-slot-migration',blocked:true});await connect(page);assert.equal(await page.locator('#install-backup').isEnabled(),true);await page.locator('#install-backup').click();await page.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);assert.equal(await page.locator('#install-confirmation-fields').isHidden(),true);assert.equal(await page.locator('#install-write').isDisabled(),true);await context.close();});
  for(const reject of ['UNKNOWN_LAYOUT_REFUSE_WRITE','BOOTLOADER_CONTRACT_MISMATCH','OTA_UNCONFIRMED_BOOT']) await check('UI-REJECT-'+reject,async()=>{const {page,context}=await ui({reject});await connect(page);assert.equal(await page.locator('#install-write').isDisabled(),true);assert.equal(await page.locator('#install-backup').isDisabled(),true);assert.match(await page.locator('#install-detail').textContent(),new RegExp(reject));await context.close();});
  await check('UI-BAD-BACKUP',async()=>{const {page,context}=await ui({badBackup:true});await connect(page);await page.locator('#install-backup').click();await page.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);assert.equal(await page.locator('#install-write').isDisabled(),true);assert.match(await page.locator('#install-detail').textContent(),/备份校验回执无效/);await context.close();});
  await check('UI-ACK-IS-NOT-COMPLETE-CANCEL',async()=>{const {page,context}=await ui({delayed:true});await connect(page);await backupConfirm(page);await page.locator('#install-write').click();await page.waitForFunction(()=>calls.includes('execute'));assert.equal((await page.evaluate(()=>PaperspaceInstaller.snapshot())).phase,'writing');assert.match(await page.locator('#install-progress-label').textContent(),/等待完整读回/);await page.locator('#install-cancel').click();await page.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);assert.equal((await page.evaluate(()=>PaperspaceInstaller.snapshot())).confirmationReady,false);assert.equal(await page.locator('#install-write').isDisabled(),true);await context.close();});
  for(const scenario of [{incomplete:true},{writeFailure:true}]) await check('UI-WRITE-FAIL-'+Object.keys(scenario)[0],async()=>{const {page,context}=await ui(scenario);await connect(page);await backupConfirm(page);await page.locator('#install-write').click();await page.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);assert.equal((await page.evaluate(()=>PaperspaceInstaller.snapshot())).phase,'failed');assert.match(await page.locator('#install-result').textContent(),/不会自动回滚/);await context.close();});
  await check('UI-VERIFIED-IS-NOT-BOOT-HEALTH',async()=>{const {page,context}=await ui();await connect(page);await backupConfirm(page);await page.locator('#install-write').click();await page.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);assert.equal((await page.evaluate(()=>PaperspaceInstaller.snapshot())).phase,'complete');assert.match(await page.locator('#install-result').textContent(),/未验证启动健康/);await context.close();});
  await check('UI-LEAVE-INVALIDATES',async()=>{const {page,context}=await ui();await connect(page);await backupConfirm(page);await page.evaluate(()=>location.hash='#home');await page.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);assert.equal((await page.evaluate(()=>PaperspaceInstaller.snapshot())).confirmationReady,false);assert.equal(await page.locator('#install-write').isDisabled(),true);assert.ok((await page.evaluate(()=>calls)).includes('disconnect'));await context.close();});
  await check('UI-UNCERTAIN-CLOSE-BLOCKS-RECONNECT',async()=>{const {page,context}=await ui({held:true});await connect(page);await page.locator('#install-disconnect').click();await page.waitForFunction(()=>!PaperspaceInstaller.snapshot().busy);assert.equal((await page.evaluate(()=>PaperspaceInstaller.snapshot())).portCloseUncertain,true);assert.equal(await page.locator('#install-connect').isDisabled(),true);assert.equal(await page.locator('#install-reload').isDisabled(),true);await context.close();});
} finally {
  await browser.close();await new Promise(r=>server.close(r));
  const report={suite:'installer-local-regression',engineSha256:hash(await readFile(resolve(root,'real-flash/engine.js'))),uiSha256:hash(await readFile(resolve(root,'real-flasher-ui.js'))),livePolicySha256:hash(await readFile(resolve(root,'firmware-target.json'))),node:process.version,checks,realDeviceWrite:false,limits:['UI checks use a substituted in-memory controller','Production policy/download checks do not validate an ESP image or hardware layout','Compatibility algorithm/protocol/real hardware still require separate validation']};
  const output=process.env.REPORT_PATH || resolve(root,'evidence/local-checks/installer-regression.json');await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length,report:output}));
}
