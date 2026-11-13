// SPDX-License-Identifier: MIT
// End-to-end, offline CLI checks with the real economic validators.
// All amounts and GitHub links here are synthetic test fixtures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const command = (script, ...args) => spawnSync(process.execPath,
  [join(root, 'scripts', script), ...args], { encoding: 'utf8', timeout: 5000 });

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'spica-proposal-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = (name, data) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(data) + '\n');
    return path;
  };
  return { file };
}

function tokenomics() {
  return {
    schemaVersion: 1, status: 'proposal', deploymentApproved: false,
    product: { aiCreditConversionEnabled: false, tokenSalesEnabled: false },
    network: { candidate: 'arbitrum-one' },
    token: { name: 'SpicaCash', symbol: 'SPICA', decimals: 18,
      totalSupplyBaseUnits: '1000' },
    allocations: [
      { id: 'contributors-test', category: 'contributors', amountBaseUnits: '400',
        rationale: 'A synthetic contributor reserve for offline validation only',
        vestingPolicy: 'onchain', vestingMonths: 24 },
      { id: 'community-test', category: 'community', amountBaseUnits: '600',
        rationale: 'A synthetic community reserve for offline validation only',
        vestingPolicy: 'none', vestingMonths: 0 }
    ],
    treasury: { status: 'proposed', walletType: 'multisig', signerCount: 3,
      approvalThreshold: 2 },
    reviews: { security: 'not_started', legal: 'not_started' }
  };
}

function grant(id, number, units) {
  return {
    id, sourcePullRequest: 'https://github.com/ExampleOrg/dummy-repo/pull/' + number,
    amountBaseUnits: String(units),
    rationale: 'Synthetic contribution used to verify offline financial guards only',
    vestingMonths: 24, cliffMonths: 6
  };
}

function batch(...grants) {
  return {
    schemaVersion: 1, status: 'proposal', deploymentApproved: false,
    distributionEnabled: false, aiCreditConversionEnabled: false,
    tokenomicsBucketId: 'contributors-test', grants
  };
}

function assertExit(result, code) {
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, code, result.stderr + '\n' + result.stdout);
}

test('tokenomics CLI accepts a synthetic proposal for review only', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const r = command('validate-tokenomics.mjs', economics, '--require-proposal');
  assertExit(r, 0);
  assert.match(r.stdout, /NOT approved for deployment/);
});

test('grant CLI accepts a proposal only with its valid companion tokenomics', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const grants = f.file('grants.json', batch(grant('test-grant-one', 1, 150)));
  const r = command('validate-contributor-grants.mjs', grants,
    '--tokenomics', economics, '--require-proposal');
  assertExit(r, 0);
  assert.match(r.stdout, /Proposed base units: 150/);
  assert.match(r.stdout, /Unassigned contributor bucket base units: 250/);
  assert.match(r.stdout, /NOT approved for issuance/);
});

test('multi-batch CLI reconciles two independently valid synthetic grants', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const a = f.file('a.json', batch(grant('test-grant-one', 1, 150)));
  const b = f.file('b.json', batch(grant('test-grant-two', 2, 100)));
  const r = command('check-grant-batches.mjs', '--tokenomics', economics,
    '--require-proposal', a, b);
  assertExit(r, 0);
  assert.match(r.stdout, /Batches: 2/);
  assert.match(r.stdout, /Proposed grants: 2/);
  assert.match(r.stdout, /contributors-test proposed base units: 250/);
  assert.match(r.stdout, /contributors-test unassigned base units: 150/);
});

test('multi-batch CLI rejects aggregate overspending that individual checks permit', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const a = f.file('a.json', batch(grant('test-grant-one', 1, 250)));
  const b = f.file('b.json', batch(grant('test-grant-two', 2, 250)));
  assertExit(command('validate-contributor-grants.mjs', a,
    '--tokenomics', economics, '--require-proposal'), 0);
  assertExit(command('validate-contributor-grants.mjs', b,
    '--tokenomics', economics, '--require-proposal'), 0);
  const r = command('check-grant-batches.mjs', '--tokenomics', economics,
    '--require-proposal', a, b);
  assertExit(r, 1);
  assert.match(r.stderr, /aggregate proposals exceed contributors allocation/);
});

test('multi-batch CLI rejects duplicate GitHub PR regardless of hostname case', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const a = f.file('a.json', batch(grant('test-grant-one', 1, 120)));
  const other = grant('test-grant-two', 1, 120);
  other.sourcePullRequest = other.sourcePullRequest.replace('ExampleOrg', 'exampleorg');
  const b = f.file('b.json', batch(other));
  const r = command('check-grant-batches.mjs', '--tokenomics', economics,
    '--require-proposal', a, b);
  assertExit(r, 1);
  assert.match(r.stderr, /duplicate GitHub PR across batches/);
});

test('multi-batch CLI rejects duplicate grant IDs across distinct contributions', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const a = f.file('a.json', batch(grant('same-grant-id', 1, 120)));
  const b = f.file('b.json', batch(grant('same-grant-id', 2, 120)));
  const r = command('check-grant-batches.mjs', '--tokenomics', economics,
    '--require-proposal', a, b);
  assertExit(r, 1);
  assert.match(r.stderr, /duplicate grant id across batches/);
});

test('proposal review CLIs fail closed without companion tokenomics', t => {
  const f = fixture(t), grants = f.file('grants.json', batch(grant('test-grant-one', 1, 120)));
  const a = command('validate-contributor-grants.mjs', grants, '--require-proposal');
  const b = command('check-grant-batches.mjs', '--require-proposal', grants);
  assertExit(a, 1);
  assertExit(b, 1);
  assert.match(a.stderr, /complete local tokenomics proposal is required/);
  assert.match(b.stderr, /complete local tokenomics proposal is required/);
});

test('unsafe execution authorization never passes standalone proposal validation', t => {
  const f = fixture(t), economics = tokenomics();
  economics.deploymentApproved = true;
  const path = f.file('economics.json', economics);
  const r = command('validate-tokenomics.mjs', path, '--require-proposal');
  assertExit(r, 1);
  assert.match(r.stderr, /never authorizes deployment/);
});

test('individual grant proposal exceeding its contributor reserve is rejected', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const grants = f.file('grants.json', batch(grant('test-grant-one', 1, 401)));
  const r = command('validate-contributor-grants.mjs', grants,
    '--tokenomics', economics, '--require-proposal');
  assertExit(r, 1);
  assert.match(r.stderr, /proposed grants exceed the contributor bucket/);
});

test('exactly filled contributor reserve reports zero unassigned units', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const grants = f.file('grants.json', batch(grant('full-reserve-test', 10, 400)));
  const r = command('validate-contributor-grants.mjs', grants,
    '--tokenomics', economics, '--require-proposal');
  assertExit(r, 0);
  assert.match(r.stdout, /Proposed base units: 400/);
  assert.match(r.stdout, /Unassigned contributor bucket base units: 0/);
  assert.match(r.stdout, /NOT approved for issuance/);
});

test('multiple grants in one batch cannot exceed contributor reserve', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const grants = f.file('grants.json', batch(
    grant('first-grant-test', 11, 250), grant('second-grant-test', 12, 175)));
  const r = command('validate-contributor-grants.mjs', grants,
    '--tokenomics', economics, '--require-proposal');
  assertExit(r, 1);
  assert.match(r.stderr, /proposed grants exceed the contributor bucket/);
});

test('batch reconciliation forbids mixing empty drafts with proposals', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const a = f.file('draft.json', {
    schemaVersion: 1, status: 'draft', deploymentApproved: false,
    distributionEnabled: false, aiCreditConversionEnabled: false,
    tokenomicsBucketId: null, grants: []
  });
  const b = f.file('proposal.json', batch(grant('test-grant-one', 13, 150)));
  const r = command('check-grant-batches.mjs', '--tokenomics', economics, a, b);
  assertExit(r, 1);
  assert.match(r.stderr, /cannot mix drafts and proposals/);
});

test('review-only tokenomics rejects credit-conversion activation', t => {
  const f = fixture(t), plan = tokenomics();
  plan.product.aiCreditConversionEnabled = true;
  const r = command('validate-tokenomics.mjs', f.file('economics.json', plan),
    '--require-proposal');
  assertExit(r, 1);
  assert.match(r.stderr, /product\.aiCreditConversionEnabled: must be false/);
});

test('standalone grant review rejects noncanonical contribution source URL', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const g = grant('invalid-source-test', 14, 150);
  g.sourcePullRequest = 'https://github.example/ExampleOrg/dummy-repo/pull/14';
  const r = command('validate-contributor-grants.mjs',
    f.file('grants.json', batch(g)), '--tokenomics', economics, '--require-proposal');
  assertExit(r, 1);
  assert.match(r.stderr, /expected canonical GitHub pull request URL/);
});

test('tokenomics proposal must reconcile allocations to total supply', t => {
  const f = fixture(t), plan = tokenomics();
  plan.token.totalSupplyBaseUnits = '1001';
  const r = command('validate-tokenomics.mjs', f.file('economics.json', plan),
    '--require-proposal');
  assertExit(r, 1);
  assert.match(r.stderr, /allocation sum differs from total supply/);
});

test('same-batch duplicate contribution source is rejected before reconciliation', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const g = grant('second-grant-test', 15, 100);
  g.sourcePullRequest = g.sourcePullRequest.replace('ExampleOrg', 'exampleorg');
  const r = command('validate-contributor-grants.mjs',
    f.file('grants.json', batch(grant('first-grant-test', 15, 100), g)),
    '--tokenomics', economics, '--require-proposal');
  assertExit(r, 1);
  assert.match(r.stderr, /duplicate contribution reference/);
});

test('grant base units exceeding uint256 are rejected', t => {
  const f = fixture(t), economics = f.file('economics.json', tokenomics());
  const enormous = '9'.repeat(79);
  const r = command('validate-contributor-grants.mjs',
    f.file('grants.json', batch(grant('overflow-grant-test', 16, enormous))),
    '--tokenomics', economics, '--require-proposal');
  assertExit(r, 1);
  assert.match(r.stderr, /exceeds uint256/);
});


function emptyDraftGrants() {
  return {
    schemaVersion: 1, status: 'draft', deploymentApproved: false,
    distributionEnabled: false, aiCreditConversionEnabled: false,
    tokenomicsBucketId: null, grants: []
  };
}

for (const entry of [
  { name: 'contributor grants CLI', command: 'validate-contributor-grants.mjs' },
  { name: 'multi-batch CLI', command: 'check-grant-batches.mjs' }
]) {
  test(entry.name + ' accepts a valid optional economics proposal with draft grants', t => {
    const f = fixture(t);
    const grants = f.file('draft-grants.json', emptyDraftGrants());
    const economics = f.file('safe-economics.json', tokenomics());
    const r = command(entry.command, grants, '--tokenomics', economics);
    assertExit(r, 0);
    assert.match(r.stdout, /NOT approved/);
  });

  test(entry.name + ' rejects an unsafe optional economics document on an empty draft', t => {
    const f = fixture(t);
    const grants = f.file('draft-grants.json', emptyDraftGrants());
    const bad = tokenomics();
    bad.deploymentApproved = true;
    const economics = f.file('unsafe-economics.json', bad);
    const r = command(entry.command, grants, '--tokenomics', economics);
    assertExit(r, 1);
    assert.match(r.stderr, /tokenomics\.deploymentApproved.*never authorizes deployment/);
    assert.doesNotMatch(r.stdout, /VALID/);
  });

  test(entry.name + ' rejects forbidden AI-credit conversion in companion economics', t => {
    const f = fixture(t);
    const grants = f.file('draft-grants.json', emptyDraftGrants());
    const bad = tokenomics();
    bad.product.aiCreditConversionEnabled = true;
    const economics = f.file('unsafe-credits.json', bad);
    const r = command(entry.command, grants, '--tokenomics', economics);
    assertExit(r, 1);
    assert.match(r.stderr, /tokenomics\.product\.aiCreditConversionEnabled.*must be false/);
    assert.doesNotMatch(r.stdout, /VALID/);
  });
}
