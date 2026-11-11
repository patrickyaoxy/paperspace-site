// Read-only host regression for the pinned 2.3.10 identity adaptation. No serial access.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const out=mkdtempSync(join(tmpdir(),'paperspace-identity-2310-')),checks=[];
const baseline='91ce874cb34b9415eddb48efdea8357dacf055bc',script=join(root,'scripts/engine-adaptation/adapt-release-2310.mjs');
for(const file of ['engine.js','build.json'])writeFileSync(join(out,file),execFileSync('git',['show',`${baseline}:real-flash/${file}`],{cwd:root,maxBuffer:2e6}));
const args=['--input',join(out,'engine.js'),'--build',join(out,'build.json')];
const run=(id,extra,ok)=>{const p=spawnSync(process.execPath,[script,...args,...extra],{encoding:'utf8'});assert.equal(p.status===0,ok,`${id}: ${p.stderr}`);checks.push({id,status:'PASS',exit:p.status});};
run('EXACT_BASELINE_THREE_LITERAL_TRANSFORM',['--outdir',join(out,'generated')],true);
for(const file of ['engine.js','build.json'])assert.deepEqual(readFileSync(join(out,'generated',file)),readFileSync(join(root,'real-flash',file)),'Deterministic checked-in artifact: '+file);
checks.push({id:'CHECKED_IN_OUTPUT_REPRODUCIBLE',status:'PASS'});
const receipt=JSON.parse(readFileSync(join(out,'generated/adaptation-receipt.json')));assert.equal(receipt.normalizedAstDifferences.length,3);assert.equal(receipt.outputBytes,396186);assert.equal(receipt.assertions.variableLengthOffsetsVerified,true);
run('REUSE_OUTPUT_REFUSED',['--outdir',join(out,'generated')],false);
const bad=Buffer.from(readFileSync(join(out,'engine.js')));bad[bad.length-1]^=1;writeFileSync(join(out,'tampered-engine.js'),bad);
run('TAMPERED_BASELINE_REFUSED',['--input',join(out,'tampered-engine.js'),'--outdir',join(out,'bad-engine')],false);
writeFileSync(join(out,'tampered-build.json'),readFileSync(join(out,'build.json'),'utf8')+' ');
run('TAMPERED_BUILD_REFUSED',['--build',join(out,'tampered-build.json'),'--outdir',join(out,'bad-build')],false);
// Exercise the production owner-policy loader with the exact new identity and negative controls.
const {loadOwnerPolicy}=await import(new URL('../real-flash/engine.js',import.meta.url));
const policy=JSON.parse(readFileSync(join(root,'firmware-target.json')));policy.target.sourceSha='48402ef58a1510da46a003c003385be467312ec8';policy.target.version='2.3.10';
let responsePolicy=policy;globalThis.fetch=async()=>new Response(JSON.stringify(responsePolicy));
await loadOwnerPolicy();checks.push({id:'NEW_IDENTITY_ACCEPTED_BY_PRODUCTION_LOADER',status:'PASS',scope:'policy only; not image/descriptor/device validation'});
for(const [id,key,value] of [['OLD_SOURCE_REFUSED','sourceSha','3abe593b3ad208229aaf734b879af2f5081c6cec'],['OLD_VERSION_REFUSED','version','2.1.1'],['WRONG_IDF_REFUSED','idfVersion','v6.0']]){
 responsePolicy=structuredClone(policy);responsePolicy.target[key]=value;await assert.rejects(()=>loadOwnerPolicy(),/Unreviewed release identity/);checks.push({id,status:'PASS'});
}
responsePolicy=structuredClone(policy);responsePolicy.target.partitions[2][4]-=4096;await assert.rejects(()=>loadOwnerPolicy(),/partition/i);checks.push({id:'PARTITION_GUARD_PRESERVED',status:'PASS'});
writeFileSync(join(out,'report.json'),JSON.stringify({checks,engineSha256:sha(readFileSync(join(root,'real-flash/engine.js'))),hardware:'NOT_TESTED',deviceAccess:false},null,2)+'\n');console.log(JSON.stringify({checks,out}));
