// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateContributorGrants } from '../../scripts/contributor-grants-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const draft = JSON.parse(readFileSync(join(root, 'config/contributor-grants.draft.json'), 'utf8'));
function syntheticTokenomics() {
  return {
    schemaVersion: 1, status: 'proposal', deploymentApproved: false,
    product: { aiCreditConversionEnabled: false, tokenSalesEnabled: false },
    network: { candidate: 'arbitrum-one' },
    token: { name: 'SpicaCash', symbol: 'SPICA', decimals: 18, totalSupplyBaseUnits: '1000' },
    allocations: [
      { id: 'contributors-test', category: 'contributors', amountBaseUnits: '400',
        rationale: 'Synthetic contributor budget for tests only', vestingPolicy: 'onchain', vestingMonths: 24 },
      { id: 'community-test', category: 'community', amountBaseUnits: '600',
        rationale: 'Synthetic community budget for tests only', vestingPolicy: 'none', vestingMonths: 0 }
    ],
    treasury: { status: 'proposed', walletType: 'multisig', signerCount: 3, approvalThreshold: 2 },
    reviews: { security: 'not_started', legal: 'not_started' }
  };
}
function syntheticGrants() {
  return {
    schemaVersion: 1, status: 'proposal', deploymentApproved: false,
    distributionEnabled: false, aiCreditConversionEnabled: false,
    tokenomicsBucketId: 'contributors-test', grants: [
      { id: 'reviewed-example', sourcePullRequest: 'https://github.com/example-org/example-repo/pull/12',
        amountBaseUnits: '150', rationale: 'Synthetic contribution reviewed only inside this test suite',
        vestingMonths: 24, cliffMonths: 6 },
      { id: 'second-example', sourcePullRequest: 'https://github.com/example-org/example-repo/pull/13',
        amountBaseUnits: '200', rationale: 'Synthetic contribution with a different pull request reference',
        vestingMonths: 12, cliffMonths: 0 }
    ]
  };
}
function rejects(label, modify, path) {
  test(label, () => {
    const g = syntheticGrants(), t = syntheticTokenomics();
    modify(g, t);
    const report = validateContributorGrants(g, t, { requireProposal: true });
    assert.equal(report.valid, false, JSON.stringify(report));
    assert.ok(report.errors.some((e) => e.includes(path)), report.errors.join('\n'));
  });
}
test('empty draft valid but never a proposal or distribution authorization', () => {
  assert.equal(validateContributorGrants(draft).valid, true);
  assert.equal(validateContributorGrants(draft, null, { requireProposal: true }).valid, false);
  assert.equal(draft.distributionEnabled, false);
  assert.equal(draft.aiCreditConversionEnabled, false);
});
test('valid synthetic proposal calculates exact unassigned contributor budget', () => {
  const result = validateContributorGrants(syntheticGrants(), syntheticTokenomics(), { requireProposal: true });
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.proposedBaseUnits, '350');
  assert.equal(result.unassignedBucketBaseUnits, '50');
});
test('exactly exhausts contributor bucket without overflow', () => {
  const grants = syntheticGrants();
  grants.grants[1].amountBaseUnits = '250';
  const result = validateContributorGrants(grants, syntheticTokenomics(), { requireProposal: true });
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.unassignedBucketBaseUnits, '0');
});
rejects('rejects allocation overflow', (g) => { g.grants[1].amountBaseUnits = '251'; }, 'exceed');
rejects('rejects same grant ID', (g) => { g.grants[1].id = g.grants[0].id; }, 'duplicate grant ID');
rejects('rejects same PR independent of URL casing', (g) => {
  g.grants[1].sourcePullRequest = 'https://github.com/EXAMPLE-ORG/EXAMPLE-REPO/pull/12';
}, 'duplicate contribution reference');
rejects('rejects deceptive GitHub lookalike host', (g) => {
  g.grants[0].sourcePullRequest = 'https://github.com.evil.test/org/repo/pull/12';
}, 'sourcePullRequest');
rejects('rejects query parameters in evidence URL', (g) => {
  g.grants[0].sourcePullRequest += '?secret=abc';
}, 'sourcePullRequest');
rejects('rejects amounts with decimal point', (g) => { g.grants[0].amountBaseUnits = '12.5'; }, 'amountBaseUnits');
rejects('rejects amounts as JS numbers', (g) => { g.grants[0].amountBaseUnits = 12; }, 'amountBaseUnits');
rejects('rejects zero amount', (g) => { g.grants[0].amountBaseUnits = '0'; }, 'amountBaseUnits');
rejects('rejects leading zero', (g) => { g.grants[0].amountBaseUnits = '0150'; }, 'amountBaseUnits');
rejects('rejects uint256 overflow', (g) => { g.grants[0].amountBaseUnits = (1n << 256n).toString(); }, 'uint256');
rejects('rejects infinite-length numeric input', (g) => { g.grants[0].amountBaseUnits = '9'.repeat(100000); }, 'uint256');
rejects('rejects oversized nonnumeric strings before decimal scanning', (g) => {
  g.grants[0].amountBaseUnits = 'x'.repeat(100000);
}, 'exceeds uint256');
rejects('rejects oversized decimal with an invalid trailing character', (g) => {
  g.grants[0].amountBaseUnits = '9'.repeat(100000) + 'x';
}, 'exceeds uint256');
test('maximum uint256 integer reaches budget validation rather than failing numeric parsing', () => {
  const grants = syntheticGrants();
  grants.grants = grants.grants.slice(0, 1);
  grants.grants[0].amountBaseUnits = ((1n << 256n) - 1n).toString();
  const report = validateContributorGrants(grants, syntheticTokenomics(), { requireProposal: true });
  assert.equal(report.valid, false);
  assert.match(report.errors.join('\n'), /exceed the contributor bucket/);
  assert.doesNotMatch(report.errors.join('\n'), /uint256/);
});
rejects('rejects negative cliff', (g) => { g.grants[0].cliffMonths = -1; }, 'cliffMonths');
rejects('rejects cliff longer than vesting', (g) => { g.grants[0].cliffMonths = 30; }, 'cliffMonths');
rejects('rejects absent vesting', (g) => { g.grants[0].vestingMonths = 0; }, 'vestingMonths');
rejects('rejects fractional vesting', (g) => { g.grants[0].vestingMonths = 1.5; }, 'vestingMonths');
rejects('rejects insufficient rationale', (g) => { g.grants[0].rationale = 'Done'; }, 'rationale');
rejects('rejects unknown payout wallet field', (g) => { g.grants[0].wallet = '0x123'; }, '.wallet');
rejects('rejects enabled distribution', (g) => { g.distributionEnabled = true; }, 'distributionEnabled');
rejects('rejects enabled deployment', (g) => { g.deploymentApproved = true; }, 'deploymentApproved');
rejects('rejects AI-credit conversion', (g) => { g.aiCreditConversionEnabled = true; }, 'aiCreditConversionEnabled');
test('proposal requires a valid companion tokenomics proposal', () => {
  const result = validateContributorGrants(syntheticGrants(), null, { requireProposal: true });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /tokenomics.*required/);
});
rejects('rejects tokenomics draft not proposal', (_, t) => { t.status = 'draft'; }, 'tokenomics');
rejects('rejects a category other than contributors', (_, t) => { t.allocations[0].category = 'treasury'; }, 'tokenomicsBucketId');
rejects('rejects missing contributor bucket', (g) => { g.tokenomicsBucketId = 'unknown'; }, 'tokenomicsBucketId');
rejects('rejects invalid companion supply math', (_, t) => { t.token.totalSupplyBaseUnits = '1'; }, 'tokenomics');
rejects('rejects forged token-sales authorization in tokenomics', (_, t) => { t.product.tokenSalesEnabled = true; }, 'tokenomics');
rejects('rejects too many grant entries', (g) => {
  g.grants = Array.from({ length: 1001 }, (_, i) => ({ ...g.grants[0], id: 'grant-' + i }));
}, 'maximum 1000');
rejects('rejects drafting with grants without proposal status', (g) => {
  g.status = 'draft'; g.tokenomicsBucketId = null;
}, 'draft must remain empty');
rejects('rejects invalid top-level shape', (g) => { g.signingKey = 'secret'; }, '.signingKey');
test('rejects null and arrays without throwing', () => {
  assert.equal(validateContributorGrants(null).valid, false);
  assert.equal(validateContributorGrants([]).valid, false);
});
test('CLI confirms empty draft does not authorize execution', () => {
  const output = spawnSync(process.execPath,
    [join(root, 'scripts/validate-contributor-grants.mjs'), join(root, 'config/contributor-grants.draft.json')],
    { encoding: 'utf8' });
  assert.equal(output.status, 0, output.stderr);
  assert.match(output.stdout, /NOT approved for issuance/);
});
test('CLI refuses --require-proposal against default draft', () => {
  const output = spawnSync(process.execPath,
    [join(root, 'scripts/validate-contributor-grants.mjs'), join(root, 'config/contributor-grants.draft.json'), '--require-proposal'],
    { encoding: 'utf8' });
  assert.equal(output.status, 1);
  assert.match(output.stderr, /proposal required/);
});
test('CLI rejects malformed arguments with code 2', () => {
  const output = spawnSync(process.execPath,
    [join(root, 'scripts/validate-contributor-grants.mjs'), '--bad'],
    { encoding: 'utf8' });
  assert.equal(output.status, 2);
  assert.match(output.stderr, /Usage:/);
});
test('CLI validates two synthetic local JSON files without execution', () => {
  const folder = mkdtempSync(join(tmpdir(), 'spica-grants-test-'));
  try {
    const grantsFile = join(folder, 'grants.json'), economicsFile = join(folder, 'tokenomics.json');
    writeFileSync(grantsFile, JSON.stringify(syntheticGrants()));
    writeFileSync(economicsFile, JSON.stringify(syntheticTokenomics()));
    const output = spawnSync(process.execPath, [join(root, 'scripts/validate-contributor-grants.mjs'),
      grantsFile, '--tokenomics', economicsFile, '--require-proposal'], { encoding: 'utf8' });
    assert.equal(output.status, 0, output.stderr);
    assert.match(output.stdout, /Unassigned contributor bucket base units: 50/);
    assert.match(output.stdout, /NOT approved/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('direct grants validator checks unsafe economics even on an empty draft', () => {
  for (const [field, mutate] of [
    ['deploymentApproved', t => { t.deploymentApproved = true; }],
    ['product.aiCreditConversionEnabled', t => { t.product.aiCreditConversionEnabled = true; }],
    ['product.tokenSalesEnabled', t => { t.product.tokenSalesEnabled = true; }],
    ['allocations', t => { t.token.totalSupplyBaseUnits = '999'; }]
  ]) {
    const t = syntheticTokenomics();
    mutate(t);
    const result = validateContributorGrants(draft, t);
    assert.equal(result.valid, false, field);
    assert.match(result.errors.join('\n'), /tokenomics/);
    assert.match(result.errors.join('\n'), new RegExp(field.replace('.', '\\.') + '|allocation sum'));
  }
});

test('direct grants validator accepts valid companion economics for a review-only draft', () => {
  const result = validateContributorGrants(draft, syntheticTokenomics());
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.proposedBaseUnits, undefined);
});

test('direct grants validator refuses unvalidated draft economics with populated allocations', () => {
  const t = syntheticTokenomics();
  t.status = 'draft';
  const result = validateContributorGrants(draft, t);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /tokenomics.*draft must/);
});
