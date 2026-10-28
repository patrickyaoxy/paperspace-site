// Deterministic AST-range adaptation of a known published compiled bundle.
// This does not recover or rebuild the seven unavailable original modules.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {parse,version as acornVersion} from 'acorn';
import assert from 'node:assert/strict';
const hash=b=>createHash('sha256').update(b).digest('hex');
const BASE={commit:'bc5b2694fb848b6b7a2b008e559fe2b8c3eed944',tree:'4960fade8fbc367fafe2fa7bb4abbd57418ad333',engineSha256:'f82fa742ef5ecb838d4ca28a4cfe2e5d946056e06c65409ab9bf1ed6a677fc43',buildSha256:'118670781796d45f85388a4bb68eed945e4233088e90fa0417ab80df7513dfb7',miSourceSha256:'0fbee98937b99dce3147bd161a0c34dfe0acb3f53548a03b6b830c88bfeb4f72',miAstSha256:'6f1ddd32cda0f35f9de9d37ab672e75ae52ecb47ecc1d0b899356d4f94dc72d5'};
const LOCK_SHA='2bc16c64a91e3ec2e6e8a1e29460c0933675f80d198b63f095d63d10d342ce0b';
const RULES=[{property:'sourceSha',old:'79f2f5ad303b9a588d551e3e0eb4b6e5735bc56b',next:'3abe593b3ad208229aaf734b879af2f5081c6cec'},{property:'version',old:'2.0.8',next:'2.1.1'},{diagnostic:true,old:'Unreviewed release identity: only pinned v2.0.8 contract supported',next:'Unreviewed release identity: only pinned v2.1.1 contract supported'}];
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!['start','end','loc','range','raw'].includes(k)).map(([k,x])=>[k,normalize(x)])):v;
function walk(n,visit){if(!n||typeof n!=='object')return;visit(n);for(const[k,v]of Object.entries(n))if(!['start','end','loc','range','raw'].includes(k)){if(Array.isArray(v))v.forEach(x=>walk(x,visit));else if(v&&typeof v==='object')walk(v,visit);}}
function differences(a,b,path='',out=[]){if(Object.is(a,b))return out;assert.equal(typeof a,typeof b,'AST type changed');if(a&&typeof a==='object'&&b&&typeof b==='object'){assert.deepEqual(Object.keys(a),Object.keys(b),'AST shape changed');for(const k of Object.keys(a))differences(a[k],b[k],path+'/'+k,out);}else out.push({path,before:a,after:b});return out;}
const argv=process.argv.slice(2),opts={};
while(argv.length){const k=argv.shift();assert.ok(['--input','--build','--outdir','--inspect'].includes(k),'Unknown argument');if(k==='--inspect')opts.inspect=true;else{assert.ok(argv.length,'Missing argument');opts[k.slice(2)]=argv.shift();}}
assert.ok(opts.input&&opts.build,'--input and --build required');
assert.ok(opts.inspect!==Boolean(opts.outdir),'Use --inspect OR a new --outdir');
assert.equal(acornVersion,'8.15.0');
const lockBytes=readFileSync(new URL('./package-lock.json',import.meta.url));assert.equal(hash(lockBytes),LOCK_SHA,'Parser lock differs');
const input=readFileSync(opts.input),buildBytes=readFileSync(opts.build);
assert.equal(hash(input),BASE.engineSha256,'Baseline engine differs');assert.equal(input.length,364241);
assert.equal(hash(buildBytes),BASE.buildSha256,'Baseline build record differs');
const source=input.toString('utf8');assert.ok(Buffer.from(source).equals(input),'Invalid UTF-8');
const before=parse(source,{ecmaVersion:2022,sourceType:'module'});
const mi=before.body.filter(n=>n.type==='FunctionDeclaration'&&n.id?.name==='Mi');assert.equal(mi.length,1,'Mi must be unique');
const fn=mi[0];assert.equal(hash(source.slice(fn.start,fn.end)),BASE.miSourceSha256,'Mi source differs');assert.equal(hash(JSON.stringify(normalize(fn))),BASE.miAstSha256,'Mi AST differs');
const edits=RULES.map(rule=>{const hits=[];walk(fn,n=>{if(rule.diagnostic){if(n.type==='Literal'&&n.value===rule.old)hits.push(n);}else if(n.type==='BinaryExpression'&&n.operator==='==='&&n.left.type==='MemberExpression'&&!n.left.computed&&n.left.object.type==='Identifier'&&n.left.object.name==='t'&&n.left.property.name===rule.property&&n.right.type==='Literal'&&n.right.value===rule.old)hits.push(n.right);});assert.equal(hits.length,1,'Target node must be unique: '+(rule.property||'diagnostic'));const n=hits[0],start=Buffer.byteLength(source.slice(0,n.start)),end=Buffer.byteLength(source.slice(0,n.end)),oldToken=Buffer.from(JSON.stringify(rule.old)),newToken=Buffer.from(JSON.stringify(rule.next));assert.ok(input.subarray(start,end).equals(oldToken),'Old exact token differs');assert.equal(oldToken.length,newToken.length,'This reviewed transform requires fixed-length edits');return{...rule,start,end,oldToken,newToken};}).sort((a,b)=>a.start-b.start);
assert.equal(edits.length,3);for(let i=1;i<edits.length;i++)assert.ok(edits[i-1].end<=edits[i].start);
// Additional explicit protected conditions in Mi; the whole old AST is also pinned.
let idf=[];walk(fn,n=>{if(n.type==='BinaryExpression'&&n.operator==='==='&&n.left.type==='MemberExpression'&&n.left.object.name==='t'&&n.left.property.name==='idfVersion')idf.push(n.right.value);});assert.deepEqual(idf,['v6.1']);
const publicEdits=edits.map(({oldToken,newToken,...e})=>e);
if(opts.inspect){console.log(JSON.stringify({mode:'INSPECT_ONLY_NO_TRANSFORM',baseline:BASE,parserVersion:acornVersion,plannedEdits:publicEdits,engineOutputWritten:false},null,2));process.exit(0);}
const chunks=[];let cursor=0;
for(const e of edits){chunks.push(input.subarray(cursor,e.start),e.newToken);cursor=e.end;}
chunks.push(input.subarray(cursor));const output=Buffer.concat(chunks);assert.equal(output.length,input.length);
cursor=0;for(const e of edits){assert.ok(output.subarray(cursor,e.start).equals(input.subarray(cursor,e.start)),'Outside edit bytes differ');cursor=e.end;}assert.ok(output.subarray(cursor).equals(input.subarray(cursor)));
const after=parse(output.toString('utf8'),{ecmaVersion:2022,sourceType:'module'});
const diffs=differences(normalize(before),normalize(after));assert.equal(diffs.length,3,'Exactly three AST values must change');assert.ok(diffs.every(x=>x.path.endsWith('/value')),'Only Literal.value may change');
assert.deepEqual(diffs.map(x=>[x.before,x.after]),edits.map(e=>[e.old,e.next]));
const afterMi=after.body.filter(n=>n.type==='FunctionDeclaration'&&n.id?.name==='Mi');assert.equal(afterMi.length,1);
// All top-level AST nodes other than Mi, including zt/xi/session/OTA/WL/exports, match exactly.
assert.deepEqual(normalize(before.body.filter(n=>n!==fn)),normalize(after.body.filter(n=>n!==afterMi[0])));
const outdir=resolve(opts.outdir);assert.ok(!existsSync(outdir),'Preserve existing output; choose a new directory');
const originalBuild=JSON.parse(buildBytes),scriptSha=hash(readFileSync(fileURLToPath(import.meta.url)));
const metadata={scope:originalBuild.scope,sdk:originalBuild.sdk,provenanceMode:'compiled-bundle-derived',originalModulesRecovered:false,originalModulesRebuilt:false,baseline:{commit:BASE.commit,tree:BASE.tree,engineSha256:BASE.engineSha256,buildRecordSha256:BASE.buildSha256,historicalBuildRecord:originalBuild},adaptation:{method:'acorn-ast-range-exact-literal-edits',parserVersion:acornVersion,parserLockSha256:LOCK_SHA,scriptSha256:scriptSha,edits:publicEdits,sourceSha:RULES[0].next,version:RULES[1].next,channel:'stable',channelProof:'Required from actual final package sdkconfig/channel record and exact owner image hash before target enablement; no new runtime schema or same-version channel-switch rule',historicalLayoutDiagnostic:'Unchanged v2.0.8 six-partition contract name; geometry remains strictly unchanged'},engine_sha256:hash(output),engine_bytes:output.length,externalImports:originalBuild.externalImports,deviceTest:'NOT_RUN'};
const receipt={mode:'COMPILED_BUNDLE_DERIVED_NOT_ORIGINAL_SOURCE_BUILD',baseline:BASE,outputSha256:hash(output),outputBytes:output.length,scriptSha256:scriptSha,parserVersion:acornVersion,parserLockSha256:LOCK_SHA,edits:publicEdits,normalizedAstDifferences:diffs,assertions:{fullBaselineHash:true,uniqueMi:true,fullOldMiSourceAndAst:true,exactlyThreeLiteralValues:true,outsideRangesByteIdentical:true,allOtherTopLevelAstIdentical:true,idfAndSixPartitionGuardsUnchanged:true},policyChanged:false,firmwareGenerated:false,deviceAccess:false};
mkdirSync(outdir);writeFileSync(join(outdir,'engine.js'),output);writeFileSync(join(outdir,'build.json'),JSON.stringify(metadata,null,2)+'\n');writeFileSync(join(outdir,'adaptation-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({outdir,outputSha256:hash(output),bytes:output.length}));
