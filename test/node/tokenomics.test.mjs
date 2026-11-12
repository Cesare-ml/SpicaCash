// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateTokenomics } from '../../scripts/tokenomics-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const draft = JSON.parse(readFileSync(join(root, 'config/tokenomics.draft.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

// All example amounts below are synthetic and NOT approved tokenomics.
function syntheticProposal() {
  const plan = clone(draft);
  plan.status = 'proposal';
  plan.network.candidate = 'arbitrum-one';
  plan.token.totalSupplyBaseUnits = '1000000000000000000000';
  plan.allocations = [
    {
      id: 'community-test', category: 'community',
      amountBaseUnits: '600000000000000000000',
      rationale: 'Synthetic community allocation solely for automated tests',
      vestingPolicy: 'none', vestingMonths: 0
    },
    {
      id: 'team-test', category: 'team',
      amountBaseUnits: '400000000000000000000',
      rationale: 'Synthetic team allocation solely for automated tests',
      vestingPolicy: 'onchain', vestingMonths: 24
    }
  ];
  plan.treasury = {
    status: 'proposed', walletType: 'multisig',
    signerCount: 3, approvalThreshold: 2
  };
  return plan;
}

function reject(name, mutate, expectedPath) {
  test(name, () => {
    const proposal = syntheticProposal();
    mutate(proposal);
    const report = validateTokenomics(proposal, { requireProposal: true });
    assert.equal(report.valid, false);
    assert.ok(report.errors.some((error) => error.includes(expectedPath)), report.errors.join('\n'));
  });
}

test('an empty draft is valid but is NOT a complete proposal', () => {
  assert.equal(validateTokenomics(draft).valid, true);
  assert.equal(validateTokenomics(draft, { requireProposal: true }).valid, false);
  assert.equal(draft.deploymentApproved, false);
  assert.equal(draft.product.aiCreditConversionEnabled, false);
});

test('synthetic numerically balanced proposal passes document validation', () => {
  const report = validateTokenomics(syntheticProposal(), { requireProposal: true });
  assert.equal(report.valid, true, report.errors.join('\n'));
});

reject('rejects mismatched base-unit allocations',
  (p) => { p.token.totalSupplyBaseUnits = '999999999999999999999'; },
  'allocations');
reject('rejects floating-point amounts',
  (p) => { p.allocations[0].amountBaseUnits = '600.5'; },
  'amountBaseUnits');
reject('rejects leading zero amounts',
  (p) => { p.allocations[0].amountBaseUnits = '0600000000000000000000'; },
  'amountBaseUnits');
reject('rejects amount beyond Solidity uint256',
  (p) => { p.token.totalSupplyBaseUnits = '1' + '0'.repeat(80); },
  'exceeds uint256');
reject('rejects duplicate bucket IDs',
  (p) => { p.allocations[1].id = p.allocations[0].id; },
  'duplicate id');
reject('rejects unvested team allocation',
  (p) => { p.allocations[1].vestingPolicy = 'none'; p.allocations[1].vestingMonths = 0; },
  'team allocation must vest onchain');
reject('rejects a one-signature treasury',
  (p) => { p.treasury.approvalThreshold = 1; },
  'approvalThreshold');
reject('rejects treasury without proposed policy',
  (p) => { p.treasury = clone(draft.treasury); },
  'treasury.status');
reject('rejects AI-credit conversion',
  (p) => { p.product.aiCreditConversionEnabled = true; },
  'aiCreditConversionEnabled');
reject('rejects direct token sales in the research stage',
  (p) => { p.product.tokenSalesEnabled = true; },
  'tokenSalesEnabled');
reject('rejects deployment approval regardless of other fields',
  (p) => { p.deploymentApproved = true; },
  'deploymentApproved');
reject('rejects unknown administrative fields',
  (p) => { p.hiddenMintPermission = true; },
  'hiddenMintPermission');
reject('rejects incorrect token metadata',
  (p) => { p.token.name = 'ImposterToken'; },
  'token.name');

test('CLI accepts draft with an explicit non-deployment disclaimer', () => {
  const result = spawnSync(process.execPath,
    [join(root, 'scripts/validate-tokenomics.mjs'), join(root, 'config/tokenomics.draft.json')],
    { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /NOT approved for deployment/);
});

test('CLI rejects draft when a complete proposal is required', () => {
  const result = spawnSync(process.execPath,
    [join(root, 'scripts/validate-tokenomics.mjs'), join(root, 'config/tokenomics.draft.json'), '--require-proposal'],
    { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /proposal required/);
});

test('CLI accepts a synthetic complete proposal but does not authorize issuance', () => {
  const directory = mkdtempSync(join(tmpdir(), 'spicacash-governance-'));
  try {
    const planPath = join(directory, 'proposal.json');
    writeFileSync(planPath, JSON.stringify(syntheticProposal()));
    const result = spawnSync(process.execPath,
      [join(root, 'scripts/validate-tokenomics.mjs'), planPath, '--require-proposal'],
      { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /NOT approved for deployment/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
