// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkInvariantEvidence } from '../../scripts/check-foundry-invariants.mjs';

const fixture = () => `
Ran 5 tests for test/SpicaCashInvariant.t.sol:SpicaCashInvariantTest
[PASS] testInvariantTargetsOnlyTheHandler() (gas: 998)
[PASS] testInvariantHandlerExercisesTransferApprovalAndPull() (gas: 998)
[PASS] invariant_TotalSupplyRemainsFixed() (runs: 64, calls: 4096, reverts: 0)
[PASS] invariant_TrackedBalancesConserveAllTokens() (runs: 64, calls: 4096, reverts: 0)
[PASS] invariant_NoTokensHeldByHandlerOrFixture() (runs: 64, calls: 4096, reverts: 0)
Suite result: ok. 5 passed; 0 failed; 0 skipped
`;
function rejected(name, modify, expected) {
  test(name, () => {
    const result = checkInvariantEvidence(modify(fixture()));
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), expected);
  });
}
test('plausible Foundry invariant campaign is recognized', () => {
  assert.deepEqual(checkInvariantEvidence(fixture()), { valid: true, errors: [] });
});
test('ANSI-colored output and CRLF are recognized', () => {
  assert.equal(checkInvariantEvidence(fixture().replaceAll('[PASS]', '\x1b[32m[PASS]\x1b[0m').replaceAll('\n','\r\n')).valid, true);
});
rejected('suite cannot be unrelated', s => s.replace('SpicaCashInvariantTest', 'OtherTest'), /suite header missing/);
rejected('a passing smoke test cannot be omitted', s => s.replace('[PASS] testInvariantTargetsOnlyTheHandler()', '[SKIP] testInvariantTargetsOnlyTheHandler()'), /testInvariantTargetsOnlyTheHandler/);
rejected('all invariants must appear', s => s.replace('[PASS] invariant_NoTokensHeldByHandlerOrFixture()', '[SKIP] invariant_NoTokensHeldByHandlerOrFixture()'), /invariant_NoTokensHeldByHandlerOrFixture/);
rejected('64-run minimum is enforced', s => s.replace('runs: 64', 'runs: 1'), /fewer than 64/);
rejected('4096-call minimum is enforced', s => s.replace('calls: 4096', 'calls: 0'), /fewer than 4096/);
rejected('nonzero revert is never accepted', s => s.replace('reverts: 0', 'reverts: 1'), /nonzero revert/);
rejected('an explicit failure overrides PASS markers', s => s + '\n[FAIL] testUnexpected()\n', /failing tests/);
rejected('Forge success summary is required', s => s.replace('5 passed; 0 failed', '4 passed; 1 failed'), /success summary/);
rejected('duplicate PASS markers are refused', s => s + '\n[PASS] invariant_TotalSupplyRemainsFixed() (runs: 64, calls: 4096, reverts: 0)\n', /exactly five passing markers/);
rejected('empty transcript fails closed', () => '', /missing or oversized/);
rejected('suite test count cannot be exaggerated', s => s.replace('Ran 5 tests', 'Ran 9 tests'), /exactly five tests/);
rejected('summary must count five passing tests', s => s.replace('5 passed; 0 failed', '9 passed; 0 failed'), /success summary/);
rejected('nonzero skipped tests are rejected', s => s.replace('0 skipped', '1 skipped'), /success summary/);
rejected('summary cannot be duplicated', s => s + '\nTest result: ok. 5 passed; 0 failed; 0 skipped\n', /success summary/);
rejected('an unrelated extra suite cannot be combined', s => s + '\nRan 1 test for test/Other.t.sol:Other\n[PASS] testOther()\nSuite result: ok. 1 passed; 0 failed; 0 skipped\n', /exactly one Foundry test suite/);
rejected('passing markers after summary are not counted', s => {
  const line = '[PASS] invariant_NoTokensHeldByHandlerOrFixture() (runs: 64, calls: 4096, reverts: 0)';
  return s.replace(line, '') + '\n' + line + '\n';
}, /invariant_NoTokensHeldByHandlerOrFixture/);
rejected('an extra unexpected passing test is refused', s => s.replace('Suite result:', '[PASS] testUnexpected() (gas: 1)\nSuite result:'), /exactly five passing markers/);

test('CLI works with evidence file and fails on missing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spica-forge-evidence-'));
  const path = join(dir, 'transcript.txt');
  try {
    writeFileSync(path, fixture());
    const ok = spawnSync(process.execPath, ['scripts/check-foundry-invariants.mjs', path], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /PASS: 3 invariant campaigns/);
    const bad = spawnSync(process.execPath, ['scripts/check-foundry-invariants.mjs', join(dir,'missing')], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /cannot read Forge output/);
  } finally { rmSync(dir, { recursive:true, force:true }); }
});
