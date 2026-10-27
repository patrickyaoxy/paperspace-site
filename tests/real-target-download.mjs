// Verify the local candidate through the production public API. No serial access.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import http from 'node:http';
import {createRequire} from 'node:module';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const candidatePath=resolve(root,process.argv[2] || 'candidates/firmware-target.v2.0.8.json');
const reportPath=resolve(root,process.argv[3] || 'evidence/local-checks/real-target-download.json');
assert.ok(candidatePath.startsWith(root+'/'),'Candidate must be within the checkout');
const candidateBytes=await readFile(candidatePath);
const policy=JSON.parse(candidateBytes);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const liveBefore=await readFile(resolve(root,'firmware-target.json'));
assert.equal(JSON.parse(liveBefore).enabled,false);assert.equal(JSON.parse(liveBefore).target,null);
assert.equal(policy.enabled,true);assert.equal(policy.target.board,'Read Pico');assert.equal(policy.target.model,'ESP32-S3 / 16MB / Zbit');assert.equal(policy.target.project,'Read_Pico');
assert.equal(policy.target.knownLayouts.length,1);assert.equal(policy.target.knownLayouts[0].partitionSha256,'ceb0bf03239c94c30fa19226d32a32ba7cbcabe3c643fda81287662a824e47ec');assert.deepEqual(policy.target.acceptedBootloaders,[]);
for(const member of [policy.target.manifest,...Object.values(policy.target.images)]) assert.ok(/^firmware\/v2\.0\.8\/[A-Za-z0-9_./-]+$/.test(member.url));
let corrupt=false;const requests=[];
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');requests.push(url.pathname);
  try {
    if(url.pathname==='/verify') {res.setHeader('Content-Type','text/html');res.end('<script type="module">import * as engine from "/real-flash/engine.js";window.engine=engine;</script>');return;}
    if(url.pathname==='/firmware-target.json') {res.setHeader('Content-Type','application/json');res.end(candidateBytes);return;}
    const path=resolve(root,'.'+decodeURIComponent(url.pathname));assert.ok(path.startsWith(root+'/'));
    let bytes=await readFile(path);
    if(corrupt && url.pathname==='/'+policy.target.images.app.url){bytes=Buffer.from(bytes);bytes[0]^=1;}
    res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'application/octet-stream');res.setHeader('Content-Length',bytes.length);res.end(bytes);
  }catch{res.statusCode=404;res.end('not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const checks=[];
async function check(id,run){try{await run();checks.push({id,status:'PASS'});}catch(e){checks.push({id,status:'FAIL',error:String(e)});throw e;}}
try{
  const page=await browser.newPage();
  await page.addInitScript(()=>{window.serialRequests=0;Object.defineProperty(navigator,'serial',{value:{requestPort(){window.serialRequests++;throw Error('SERIAL_FORBIDDEN_IN_DOWNLOAD_TEST');}}});});
  await page.goto('http://127.0.0.1:'+server.address().port+'/verify');await page.waitForFunction(()=>window.engine);
  await check('REAL-OWNER-POLICY',async()=>{const result=await page.evaluate(async()=>{window.policy=await engine.loadOwnerPolicy();window.controller=engine.createController({policy});return policy.target;});assert.deepEqual(result,policy.target);});
  await check('REAL-PINNED-IMAGE-DOWNLOAD',async()=>{assert.deepEqual(await page.evaluate(async()=>{const c=await controller.loadCandidate();return {source:c.source,version:c.version,appBytes:c.appBytes};}),{source:'OWNER_PINNED_RAW_IMAGES',version:'2.0.8',appBytes:policy.target.images.app.bytes});});
  await check('REAL-MANIFEST-IDENTITY',async()=>{const manifest=JSON.parse(await readFile(resolve(root,policy.target.manifest.url)));assert.equal(manifest.source_sha,'79f2f5ad303b9a588d551e3e0eb4b6e5735bc56b');assert.equal(manifest.version,'2.0.8');assert.equal(manifest.public_beta,true);assert.equal(manifest.hardware,'NOT_TESTED');assert.equal(manifest.app_descriptor.project_name,'Read_Pico');assert.equal(manifest.app_descriptor.idf_version,'v6.1');assert.ok(/MindReset/.test(manifest.origin.project));for(const item of Object.values(policy.target.images)){const bytes=await readFile(resolve(root,item.url));assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256);assert.equal(manifest.files[item.file].sha256,item.sha256);}});
  await check('REAL-CORRUPTED-DOWNLOAD-REJECTED',async()=>{corrupt=true;const error=await page.evaluate(async()=>{try{await controller.loadCandidate();return null;}catch(e){return e.message;}});assert.match(error,/Owner download SHA-256: app/);corrupt=false;});
  await check('NO-SERIAL-REQUEST',async()=>assert.equal(await page.evaluate(()=>serialRequests),0));
  await check('LIVE-TARGET-STILL-DISABLED',async()=>assert.deepEqual(await readFile(resolve(root,'firmware-target.json')),liveBefore));
}finally{
  await browser.close();await new Promise(r=>server.close(r));
  const report={suite:'real-local-candidate-download',candidate:relative(root,candidatePath),candidateSha256:sha(candidateBytes),manifestSha256:policy.target.manifest.sha256,appSha256:policy.target.images.app.sha256,engineSha256:sha(await readFile(resolve(root,'real-flash/engine.js'))),livePolicySha256:sha(liveBefore),checks,requests,deviceAccess:false,deviceWritePerformed:false,limits:['Only production owner policy and download APIs exercised','ESP image bytes checked by generator; no device prepare/execute performed','Boot/display/data/power-loss behavior remains untested on hardware']};
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length,report:relative(root,reportPath)}));
}
