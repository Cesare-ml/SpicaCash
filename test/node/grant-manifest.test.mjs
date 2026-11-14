// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,symlinkSync,mkdirSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadGrantManifest,sha256Hex} from '../../scripts/grant-manifest-core.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const cli=join(root,'scripts/check-grant-manifest.mjs');
const draft=JSON.parse(readFileSync(join(root,'config/contributor-grants.draft.json'),'utf8'));
function temp(t){const dir=mkdtempSync(join(tmpdir(),'spica-manifest-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
function put(dir,name,data){const bytes=Buffer.from(JSON.stringify(data,null,2)+'\n');writeFileSync(join(dir,name),bytes);return {path:name,sha256:sha256Hex(bytes)};}
function save(dir,data){const path=join(dir,'manifest.json');writeFileSync(path,JSON.stringify(data,null,2)+'\n');return path;}
function fixture(t){const dir=temp(t),data={schemaVersion:1,status:'draft',executionAuthorized:false,tokenomics:null,batches:[put(dir,'grant.json',draft)]};return {dir,data,path:save(dir,data)};}
function tokenomics(){return {schemaVersion:1,status:'proposal',deploymentApproved:false,
 product:{aiCreditConversionEnabled:false,tokenSalesEnabled:false},network:{candidate:'arbitrum-one'},
 token:{name:'SpicaCash',symbol:'SPICA',decimals:18,totalSupplyBaseUnits:'1000'},
 allocations:[{id:'contributors-test',category:'contributors',amountBaseUnits:'400',rationale:'Synthetic test contributor budget only',vestingPolicy:'onchain',vestingMonths:24},
 {id:'community-test',category:'community',amountBaseUnits:'600',rationale:'Synthetic community budget for tests',vestingPolicy:'none',vestingMonths:0}],
 treasury:{status:'proposed',walletType:'multisig',signerCount:3,approvalThreshold:2},
 reviews:{security:'not_started',legal:'not_started'}};}
function grant(id,pr,amount){return {schemaVersion:1,status:'proposal',deploymentApproved:false,distributionEnabled:false,
 aiCreditConversionEnabled:false,tokenomicsBucketId:'contributors-test',grants:[{
 id,sourcePullRequest:'https://github.com/example-org/demo/pull/'+pr,amountBaseUnits:String(amount),
 rationale:'Synthetic review-only grant with no actual recipient rights',
 vestingMonths:24,cliffMonths:6}]};}
function proposal(t,a=100,b=150,duplicate=false){
 const dir=temp(t),data={schemaVersion:1,status:'proposal',executionAuthorized:false,
 tokenomics:put(dir,'economics.json',tokenomics()),
 batches:[put(dir,'grant-a.json',grant('grant-a',12,a)),
          put(dir,'grant-b.json',grant('grant-b',duplicate?12:13,b))]};
 return {dir,data,path:save(dir,data)};}
const run=(path,...extra)=>spawnSync(process.execPath,[cli,path,...extra],{encoding:'utf8'});
const errors=f=>loadGrantManifest(save(f.dir,f.data)).errors.join('\n');

test('repository default SHA-256 draft manifest validates',()=>{
 const report=loadGrantManifest(join(root,'config/grant-batches.draft.manifest.json'));
 assert.equal(report.valid,true,report.errors.join('\n'));
 assert.equal(report.batches[0].plan.grants.length,0);
});
test('draft manifest CLI prints explicit non-authorization',t=>{
 const f=fixture(t),r=run(f.path);
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/NOT approved for issuance/);
});
test('manifest loader exposes SHA-256 of exact raw manifest bytes',t=>{
 const f=fixture(t),report=loadGrantManifest(f.path);
 assert.equal(report.valid,true,report.errors.join('\n'));
 assert.equal(report.manifestSha256,sha256Hex(readFileSync(f.path)));
});
test('offline CLI prints a non-authorizing manifest fingerprint',t=>{
 const r=run(fixture(t).path);
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/Manifest SHA-256: [a-f0-9]{64}/);
 assert.match(r.stdout,/not a signature or authorization/);
});
test('matching independently supplied manifest digest is accepted',t=>{
 const f=fixture(t),digest=sha256Hex(readFileSync(f.path));
 const r=run(f.path,'--expected-manifest-sha256',digest);
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/Manifest SHA-256:/);
});
test('mismatched manifest review digest fails even when inner hashes pass',t=>{
 const f=fixture(t),approved=sha256Hex(readFileSync(f.path));
 // Cosmetic reformat preserves the parsed content and all batch-file hashes.
 writeFileSync(f.path,JSON.stringify(f.data)+'\n');
 assert.equal(loadGrantManifest(f.path).valid,true);
 assert.notEqual(sha256Hex(readFileSync(f.path)),approved);
 const r=run(f.path,'--expected-manifest-sha256',approved);
 assert.equal(r.status,1,r.stdout);
 assert.match(r.stderr,/review snapshot digest mismatch/);
});
test('expected manifest digest rejects invalid casing and missing CLI values',t=>{
 const f=fixture(t);
 for(const args of [
   ['--expected-manifest-sha256'],
   ['--expected-manifest-sha256','F'.repeat(64)],
   ['--expected-manifest-sha256','xyz']
 ]) {
   const r=run(f.path,...args);
   assert.equal(r.status,2,r.stderr);
   assert.match(r.stderr,/Usage:/);
 }
 const invalid=loadGrantManifest(f.path,{expectedManifestSha256:'XYZ'});
 assert.equal(invalid.valid,false);
 assert.match(invalid.errors.join('\n'),/expected lowercase SHA-256 digest/);
});
test('wrong external pin rejects malformed manifest before JSON parsing',t=>{
 const f=fixture(t);
 writeFileSync(f.path,'{"incomplete":');
 const report=loadGrantManifest(f.path,{expectedManifestSha256:'0'.repeat(64)});
 assert.equal(report.valid,false);
 assert.deepEqual(report.errors,['manifest.sha256: review snapshot digest mismatch']);
 assert.equal(report.batches.length,0);
});
test('wrong external pin rejects untrusted linked paths before file reads',t=>{
 const f=fixture(t);
 f.data.batches[0].path='not-present.json';
 save(f.dir,f.data);
 const report=loadGrantManifest(f.path,{expectedManifestSha256:'f'.repeat(64)});
 assert.equal(report.valid,false);
 assert.deepEqual(report.errors,['manifest.sha256: review snapshot digest mismatch']);
 assert.equal(report.batches.length,0);
});
test('matching external pin still rejects malformed JSON',t=>{
 const f=fixture(t);
 writeFileSync(f.path,'{"incomplete":');
 const digest=sha256Hex(readFileSync(f.path));
 const report=loadGrantManifest(f.path,{expectedManifestSha256:digest});
 assert.equal(report.valid,false);
 assert.match(report.errors.join('\n'),/cannot read JSON/);
});
test('invalid external digest fails before parsing',t=>{
 const f=fixture(t);
 writeFileSync(f.path,'{"incomplete":');
 const report=loadGrantManifest(f.path,{expectedManifestSha256:'BAD'});
 assert.deepEqual(report.errors,['expectedManifestSha256: expected lowercase SHA-256 digest']);
});
test('require-proposal rejects draft',t=>{
 const r=run(fixture(t).path,'--require-proposal');
 assert.equal(r.status,1);assert.match(r.stderr,/review proposal is required/);
});
test('proposal manifest verifies two files and shared budget',t=>{
 const r=run(proposal(t).path,'--require-proposal');
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/Verified batches: 2/);
 assert.match(r.stdout,/proposed 250, unassigned 150/);
});
test('over-budget proposals are rejected even though hashes match',t=>{
 const r=run(proposal(t,250,200).path,'--require-proposal');
 assert.equal(r.status,1);assert.match(r.stderr,/aggregate proposals exceed/);
});
test('duplicate PR across hashed batch files is rejected',t=>{
 const r=run(proposal(t,100,150,true).path,'--require-proposal');
 assert.equal(r.status,1);assert.match(r.stderr,/duplicate GitHub PR/);
});
test('changed batch contents invalidate SHA-256',t=>{
 const f=fixture(t);writeFileSync(join(f.dir,'grant.json'),'{}\n');
 assert.match(errors(f),/digest mismatch/);
});
test('exactly 1 MiB of valid JSON batch bytes is accepted',t=>{
 const f=fixture(t);
 const original=readFileSync(join(f.dir,'grant.json'));
 const padded=Buffer.concat([original,Buffer.alloc(1024*1024-original.length,0x20)]);
 writeFileSync(join(f.dir,'grant.json'),padded);
 f.data.batches[0].sha256=sha256Hex(padded);
 const report=loadGrantManifest(save(f.dir,f.data));
 assert.equal(report.valid,true,report.errors.join('\n'));
});
test('oversized batch is rejected even with an updated matching digest',t=>{
 const f=fixture(t);
 const padded=Buffer.alloc(1024*1024+1,0x20);
 writeFileSync(join(f.dir,'grant.json'),padded);
 f.data.batches[0].sha256=sha256Hex(padded);
 assert.match(errors(f),/file exceeds 1 MiB limit/);
});
test('oversized manifest is rejected before parsing or reading linked files',t=>{
 const f=fixture(t);
 writeFileSync(f.path,Buffer.alloc(1024*1024+1,0x20));
 const result=loadGrantManifest(f.path);
 assert.equal(result.valid,false);
 assert.match(result.errors.join('\n'),/file exceeds 1 MiB limit/);
});
test('changed economics invalidate SHA-256',t=>{
 const f=proposal(t);writeFileSync(join(f.dir,'economics.json'),'{}\n');
 assert.match(errors(f),/digest mismatch/);
});
test('path traversal is rejected',t=>{
 const f=fixture(t);f.data.batches[0].path='../grant.json';assert.match(errors(f),/safe relative/);
});
test('absolute paths are rejected',t=>{
 const f=fixture(t);f.data.batches[0].path=join(f.dir,'grant.json');assert.match(errors(f),/safe relative/);
});
test('duplicate input file entries are rejected',t=>{
 const f=fixture(t);f.data.batches.push({...f.data.batches[0]});assert.match(errors(f),/duplicate file/);
});
test('symlinked batch files are rejected',t=>{
 const f=fixture(t);
 try {symlinkSync(join(f.dir,'grant.json'),join(f.dir,'alias.json'));}
 catch(e){if(e.code==='EPERM'){t.skip('no symlink rights');return;}throw e;}
 f.data.batches[0].path='alias.json';assert.match(errors(f),/symlink or redirected/);
});
test('mismatched manifest and grant review states are rejected',t=>{
 const f=fixture(t);f.data.status='proposal';f.data.tokenomics=put(f.dir,'economics.json',tokenomics());
 assert.match(errors(f),/must match/);
});
test('proposal without hashed tokenomics is rejected',t=>{
 const f=fixture(t);f.data.status='proposal';assert.match(errors(f),/requires a hashed tokenomics/);
});
test('unsafe authority and unknown fields are rejected',t=>{
 const f=fixture(t);f.data.executionAuthorized=true;f.data.signingKey='unsafe';
 assert.match(errors(f),/executionAuthorized/);assert.match(errors(f),/signingKey/);
});
test('backslash paths are rejected',t=>{
 const f=fixture(t);f.data.batches[0].path='..\\secret.json';assert.match(errors(f),/safe relative/);
});
test('invalid digest and missing files are rejected',t=>{
 const f=fixture(t);f.data.batches[0]={path:'missing.json',sha256:'A'.repeat(64)};
 assert.match(errors(f),/lowercase SHA-256/);
 f.data.batches[0].sha256='a'.repeat(64);
 assert.match(errors(f),/cannot read verified JSON/);
});
test('CLI unknown flags rejected without executing anything',t=>{
 const r=run(fixture(t).path,'--broadcast');assert.equal(r.status,2);assert.match(r.stderr,/Usage:/);
});

function groupedProposal(t) {
  const f=proposal(t);
  mkdirSync(join(f.dir,'review-batches'));
  for (const entry of f.data.batches) {
    const original=entry.path;
    renameSync(join(f.dir,original),join(f.dir,'review-batches',original));
    entry.path='review-batches/'+original;
  }
  save(f.dir,f.data);
  return f;
}
test('strict directory inventory confirms every hashed batch in scope',t=>{
  const f=groupedProposal(t);
  const r=run(f.path,'--require-proposal','--inventory-dir','review-batches');
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/Scoped inventory checked: 2 JSON files/);
});
test('strict inventory rejects unlisted batch even when other hashes match',t=>{
  const f=groupedProposal(t);
  writeFileSync(join(f.dir,'review-batches','forgotten.json'),'{}\n');
  const r=run(f.path,'--require-proposal','--inventory-dir','review-batches');
  assert.equal(r.status,1,r.stdout);
  assert.match(r.stderr,/unlisted JSON batch file/);
});
test('strict CLI inventory rejects case-variant JSON filenames',t=>{
  const f=groupedProposal(t);
  writeFileSync(join(f.dir,'review-batches','unlisted.JSON'),'{}\n');
  const r=run(f.path,'--require-proposal','--inventory-dir','review-batches');
  assert.equal(r.status,1,r.stdout);
  assert.match(r.stderr,/JSON extension must be lowercase \.json/);
});
test('strict CLI inventory fails if nested grant batches are hidden',t=>{
  const f=groupedProposal(t);
  mkdirSync(join(f.dir,'review-batches','unlisted'));
  writeFileSync(join(f.dir,'review-batches','unlisted','hidden.json'),'{}\n');
  const r=run(f.path,'--require-proposal','--inventory-dir','review-batches');
  assert.equal(r.status,1,r.stdout);
  assert.match(r.stderr,/nested directories are not allowed/);
});
test('strict inventory rejects missing folder and missing option argument',t=>{
  const f=groupedProposal(t);
  const badDir=run(f.path,'--require-proposal','--inventory-dir','no-such-folder');
  assert.equal(badDir.status,1);
  assert.match(badDir.stderr,/inventoryDirectory/);
  const missingArg=run(f.path,'--inventory-dir');
  assert.equal(missingArg.status,2);
  assert.match(missingArg.stderr,/Usage:/);
});

test('pinned review refuses missing safeguards before manifest validation',t=>{
  const f=groupedProposal(t);
  const digest=sha256Hex(readFileSync(f.path));
  const cases=[
    ['--require-proposal','--inventory-dir','review-batches'],
    ['--require-proposal','--expected-manifest-sha256',digest],
    ['--inventory-dir','review-batches','--expected-manifest-sha256',digest],
    []
  ];
  for(const args of cases){
    const r=run(f.path,'--pinned-proposal-review',...args);
    assert.equal(r.status,2,r.stderr);
    assert.match(r.stderr,/Usage:/);
    assert.doesNotMatch(r.stdout,/VALID/);
  }
});
test('pinned review succeeds with valid proposal, caller-supplied pin and complete scoped inventory',t=>{
  const f=groupedProposal(t);
  const digest=sha256Hex(readFileSync(f.path));
  const r=run(f.path,'--pinned-proposal-review','--require-proposal',
    '--inventory-dir','review-batches','--expected-manifest-sha256',digest);
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/Pinned proposal review checks completed/);
  assert.match(r.stdout,/digest provenance NOT authenticated/);
  assert.match(r.stdout,/NOT approved for issuance/);
});
test('pinned review rejects mismatched manifest digest',t=>{
  const f=groupedProposal(t);
  const r=run(f.path,'--pinned-proposal-review','--require-proposal',
    '--inventory-dir','review-batches','--expected-manifest-sha256','0'.repeat(64));
  assert.equal(r.status,1,r.stdout);
  assert.match(r.stderr,/review snapshot digest mismatch/);
});
test('pinned review rejects unlisted local batch despite matching manifest pin',t=>{
  const f=groupedProposal(t);
  const digest=sha256Hex(readFileSync(f.path));
  writeFileSync(join(f.dir,'review-batches','unlisted.json'),'{}\n');
  const r=run(f.path,'--pinned-proposal-review','--require-proposal',
    '--inventory-dir','review-batches','--expected-manifest-sha256',digest);
  assert.equal(r.status,1,r.stdout);
  assert.match(r.stderr,/unlisted JSON batch file/);
});
test('pinned review rejects draft even with all required options',t=>{
  const f=fixture(t),digest=sha256Hex(readFileSync(f.path));
  const r=run(f.path,'--pinned-proposal-review','--require-proposal',
    '--inventory-dir','.', '--expected-manifest-sha256',digest);
  assert.equal(r.status,1,r.stdout);
  assert.match(r.stderr,/review proposal is required/);
});
test('pinned review rejects repeated mode option as usage error',t=>{
  const f=groupedProposal(t),digest=sha256Hex(readFileSync(f.path));
  const r=run(f.path,'--pinned-proposal-review','--pinned-proposal-review',
    '--require-proposal','--inventory-dir','review-batches',
    '--expected-manifest-sha256',digest);
  assert.equal(r.status,2,r.stderr);
  assert.match(r.stderr,/Usage:/);
});
