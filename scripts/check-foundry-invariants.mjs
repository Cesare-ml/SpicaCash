#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Fail closed when Foundry does not report an actually exercised invariant campaign.
// This checks test-run output, not source, ABI, bytecode or handler selector metrics.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const requiredInvariants = [
  'invariant_TotalSupplyRemainsFixed',
  'invariant_TrackedBalancesConserveAllTokens',
  'invariant_NoTokensHeldByHandlerOrFixture',
];
const requiredSmoke = [
  'testInvariantTargetsOnlyTheHandler',
  'testInvariantHandlerExercisesTransferApprovalAndPull',
];

export function checkInvariantEvidence(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2_000_000) {
    return { valid: false, errors: ['missing or oversized Forge output'] };
  }
  const report = raw.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
  const errors = [];
  // Require the expected suite, not an unrelated successful contract test.
  const header = /^\s*(?:Ran|Running)\s+\d+\s+tests?\s+for\s+test\/SpicaCashInvariant\.t\.sol:SpicaCashInvariantTest\b/m;
  if (!header.test(report)) errors.push('SpicaCashInvariantTest suite header missing');
  if (/^\s*\[FAIL\]/m.test(report)) errors.push('Forge output includes failing tests');
  if (!/(?:Suite|Test) result:\s*ok\.\s*\d+\s+passed;\s*0\s+failed\b/m.test(report)) {
    errors.push('success summary with zero failed tests missing');
  }

  for (const name of requiredSmoke) {
    const pattern = new RegExp(`^\\s*\\[PASS\\]\\s+${name}\\(\\)`, 'gm');
    const matches = [...report.matchAll(pattern)];
    if (matches.length !== 1) errors.push(`${name}: expected exactly one passing result`);
  }
  for (const name of requiredInvariants) {
    const pattern = new RegExp(
      `^\\s*\\[PASS\\]\\s+${name}\\(\\)\\s+\\(runs:\\s*(\\d+),\\s*calls:\\s*(\\d+),\\s*reverts:\\s*(\\d+)\\)`,
      'gm'
    );
    const matches = [...report.matchAll(pattern)];
    if (matches.length !== 1) {
      errors.push(`${name}: expected exactly one passing invariant campaign with metrics`);
      continue;
    }
    const [runs, calls, reverts] = matches[0].slice(1).map(BigInt);
    if (runs < 64n) errors.push(`${name}: fewer than 64 invariant runs`);
    if (calls < 4096n) errors.push(`${name}: fewer than 4096 invariant calls`);
    if (reverts !== 0n) errors.push(`${name}: nonzero revert count`);
  }
  return { valid: errors.length === 0, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) {
    console.error('Usage: node scripts/check-foundry-invariants.mjs <forge-test-output-file>');
    process.exitCode = 2;
  } else {
    try {
      const result = checkInvariantEvidence(readFileSync(path, 'utf8'));
      if (!result.valid) {
        for (const problem of result.errors) console.error(`Invariant evidence failed: ${problem}`);
        process.exitCode = 1;
      } else {
        console.log('PASS: 3 invariant campaigns (>=64 runs, >=4096 calls, zero reverts) and 2 smoke tests');
      }
    } catch {
      // Do not echo file paths or error payloads, which could contain sensitive data.
      console.error('Invariant evidence failed: cannot read Forge output');
      process.exitCode = 1;
    }
  }
}
