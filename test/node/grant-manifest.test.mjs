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
