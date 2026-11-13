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
