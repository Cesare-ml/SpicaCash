// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateContributorGrants } from '../../scripts/contributor-grants-core.mjs';
import { reconcileGrantBatches } from '../../scripts/grant-batches-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const clone = (x) => JSON.parse(JSON.stringify(x));
const draft = JSON.parse(readFileSync(join(root,'config/contributor-grants.draft.json'),'utf8'));

function economics() {
  return {
    schemaVersion:1, status:'proposal', deploymentApproved:false,
    product:{aiCreditConversionEnabled:false,tokenSalesEnabled:false},
    network:{candidate:'arbitrum-one'},
    token:{name:'SpicaCash',symbol:'SPICA',decimals:18,totalSupplyBaseUnits:'1000'},
    allocations:[
      {id:'contributors-test',category:'contributors',amountBaseUnits:'400',
       rationale:'Synthetic contributors budget for batch testing only',vestingPolicy:'onchain',vestingMonths:24},
      {id:'community-test',category:'community',amountBaseUnits:'600',
       rationale:'Synthetic community reserve for batch testing only',vestingPolicy:'none',vestingMonths:0}
    ],
    treasury:{status:'proposed',walletType:'multisig',signerCount:3,approvalThreshold:2},
    reviews:{security:'not_started',legal:'not_started'}
  };
}
function batch(name,pr,amount) {
  return {
    name:name+'.json',
    plan:{
      schemaVersion:1,status:'proposal',deploymentApproved:false,
      distributionEnabled:false,aiCreditConversionEnabled:false,
      tokenomicsBucketId:'contributors-test',
      grants:[{id:name,sourcePullRequest:'https://github.com/example-org/demo/pull/'+pr,
        amountBaseUnits:String(amount),rationale:'Only a synthetic test proposal without economic rights',
        vestingMonths:24,cliffMonths:0}]
    }
  };
}
const check=(batches,tokenomics=economics(),options={}) =>
  reconcileGrantBatches(batches,tokenomics,validateContributorGrants,options);

test('two batches use a shared exact contributor budget', () => {
  const result=check([batch('grant-a',12,150),batch('grant-b',13,200)],economics(),{requireProposal:true});
  assert.equal(result.valid,true,result.errors.join('\n'));
  assert.deepEqual(result.totals,{'contributors-test':{proposedBaseUnits:'350',unassignedBaseUnits:'50'}});
  assert.equal(result.proposalCount,2);
});
test('exactly exhausts the shared budget', () => {
  const result=check([batch('grant-a',12,150),batch('grant-b',13,250)]);
  assert.equal(result.valid,true,result.errors.join('\n'));
  assert.equal(result.totals['contributors-test'].unassignedBaseUnits,'0');
});
test('two individually valid batches cannot together exceed the shared budget', () => {
  const a=batch('grant-a',12,250),b=batch('grant-b',13,200);
  assert.equal(validateContributorGrants(a.plan,economics(),{requireProposal:true}).valid,true);
  assert.equal(validateContributorGrants(b.plan,economics(),{requireProposal:true}).valid,true);
  const result=check([a,b]);
  assert.equal(result.valid,false);
  assert.match(result.errors.join('\n'),/aggregate proposals exceed/);
});
test('duplicate GitHub PR references across batches are blocked case-insensitively', () => {
  const a=batch('grant-a',12,100),b=batch('grant-b',13,100);
  b.plan.grants[0].sourcePullRequest='https://github.com/EXAMPLE-ORG/DEMO/pull/12';
  const result=check([a,b]);
  assert.equal(result.valid,false);
  assert.match(result.errors.join('\n'),/duplicate GitHub PR across batches/);
});
test('duplicate grant ids across batches are blocked', () => {
  const a=batch('grant-a',12,100),b=batch('grant-b',13,100);
  b.plan.grants[0].id='grant-a';
  const result=check([a,b]);
  assert.equal(result.valid,false);
  assert.match(result.errors.join('\n'),/duplicate grant id across batches/);
});
test('same input file twice is rejected', () => {
  const x=batch('grant-a',12,100);
  const result=check([x,clone(x)]);
  assert.equal(result.valid,false);
  assert.match(result.errors.join('\n'),/duplicate file name/);
});
test('mixing draft and proposal is rejected to avoid incomplete accounting', () => {
  const result=check([{name:'empty.json',plan:clone(draft)},batch('grant-a',12,100)]);
  assert.equal(result.valid,false);
  assert.match(result.errors.join('\n'),/cannot mix drafts and proposals/);
});
test('empty drafts may be inspected without economic decisions', () => {
  const result=check([{name:'empty.json',plan:clone(draft)}],null);
  assert.equal(result.valid,true,result.errors.join('\n'));
  assert.deepEqual(result.totals,{});
  assert.equal(result.proposalCount,0);
});
test('require-proposal refuses the default empty draft', () => {
  const result=check([{name:'empty.json',plan:clone(draft)}],null,{requireProposal:true});
  assert.equal(result.valid,false);
});
test('missing tokenomics proposal fails on nonempty batches', () => {
  const result=check([batch('grant-a',12,100)],null);
  assert.equal(result.valid,false);
});
test('unsafe single-batch flags are rejected before aggregation', () => {
  const input=batch('grant-a',12,100); input.plan.distributionEnabled=true;
  const result=check([input]);
  assert.equal(result.valid,false);
  assert.match(result.errors.join('\n'),/distributionEnabled/);
});
test('untrusted lookalike GitHub PR URLs are refused by existing validator', () => {
  const input=batch('grant-a',12,100);
  input.plan.grants[0].sourcePullRequest='https://github.com.bad-site.test/x/y/pull/12';
  const result=check([input]);
  assert.equal(result.valid,false);
  assert.match(result.errors.join('\n'),/sourcePullRequest/);
});
test('rejects absent and oversized batch lists', () => {
  assert.equal(check([]).valid,false);
  assert.equal(check(Array.from({length:65},(_,i)=>batch('grant-'+i,i+1,1))).valid,false);
});
test('rejects invalid companion budget math', () => {
  const wrong=economics();wrong.token.totalSupplyBaseUnits='999';
  assert.equal(check([batch('grant-a',12,100)],wrong).valid,false);
});
test('CLI accepts default draft only as review, not payment authorization', () => {
  const p=join(root,'config/contributor-grants.draft.json');
  const run=spawnSync(process.execPath,[join(root,'scripts/check-grant-batches.mjs'),p],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/NOT approved for issuance/);
});
test('CLI reports cross-file over-allocation and rejects it', () => {
  const tmp=mkdtempSync(join(tmpdir(),'spica-batches-'));
  try {
    const t=join(tmp,'tokenomics.json'),a=join(tmp,'a.json'),b=join(tmp,'b.json');
    writeFileSync(t,JSON.stringify(economics()));
    writeFileSync(a,JSON.stringify(batch('grant-a',12,250).plan));
    writeFileSync(b,JSON.stringify(batch('grant-b',13,200).plan));
    const run=spawnSync(process.execPath,[join(root,'scripts/check-grant-batches.mjs'),
      '--tokenomics',t,'--require-proposal',a,b],{encoding:'utf8'});
    assert.equal(run.status,1,run.stdout);
    assert.match(run.stderr,/aggregate proposals exceed/);
  } finally {rmSync(tmp,{recursive:true,force:true});}
});
test('CLI rejects unexpected options (without reading files)', () => {
  const run=spawnSync(process.execPath,[join(root,'scripts/check-grant-batches.mjs'),'--broadcast'],
    {encoding:'utf8'});
  assert.equal(run.status,2);
  assert.match(run.stderr,/Usage:/);
});

test('direct batch reconciler refuses unsafe optional economics on empty drafts', () => {
  for (const mutate of [
    t => { t.deploymentApproved = true; },
    t => { t.product.aiCreditConversionEnabled = true; },
    t => { t.token.totalSupplyBaseUnits = '999'; }
  ]) {
    const t = economics();
    mutate(t);
    const result = check([{name:'empty.json',plan:clone(draft)}], t);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /tokenomics/);
  }
});

test('direct batch reconciler accepts safe economics with empty drafts without proposing grants', () => {
  const result = check([{name:'empty.json',plan:clone(draft)}], economics());
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.proposalCount, 0);
  assert.deepEqual(result.totals, {});
});
