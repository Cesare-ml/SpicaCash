// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkInvariantEvidence } from '../../scripts/check-foundry-invariants.mjs';

const metrics = (move = 1400, approve = 1400, pull = 1296) => `
╭----------------------------+----------+-------+---------+----------╮
| Contract                   | Selector | Calls | Reverts | Discards |
+============================+==========+=======+=========+==========+
| SpicaCashInvariantHandler  | move     | ${move} | 0       | 0        |
| SpicaCashInvariantHandler  | approve  | ${approve} | 0       | 0        |
| SpicaCashInvariantHandler  | pull     | ${pull} | 0       | 0        |
╰----------------------------+----------+-------+---------+----------╯`;

const fixture = () => `
Ran 5 tests for test/SpicaCashInvariant.t.sol:SpicaCashInvariantTest
[PASS] testInvariantTargetsOnlyTheHandler() (gas: 998)
[PASS] testInvariantHandlerExercisesTransferApprovalAndPull() (gas: 998)
[PASS] invariant_TotalSupplyRemainsFixed() (runs: 64, calls: 4096, reverts: 0)
${metrics()}
[PASS] invariant_TrackedBalancesConserveAllTokens() (runs: 64, calls: 4096, reverts: 0)
${metrics()}
[PASS] invariant_NoTokensHeldByHandlerOrFixture() (runs: 64, calls: 4096, reverts: 0)
${metrics()}
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


// Selector metrics guard: aggregate campaign PASS counts are not enough to
// prove the fuzz engine ever invoked all three handler methods.
rejected('missing selector table fails closed', s => s.replace(metrics(), ''), /expected exactly one Foundry selector metrics table/);
rejected('missing pull selector fails closed', s => s.replace('| SpicaCashInvariantHandler  | pull     | 1296 | 0       | 0        |', ''), /expected exactly three handler selector metric rows/);
rejected('zero calls to one handler fail', s => s.replace('| move     | 1400 |', '| move     | 0 |'), /move selector was never called/);
rejected('handler revert is rejected', s => s.replace('| approve  | 1400 | 0       |', '| approve  | 1400 | 1       |'), /approve selector reverted/);
rejected('discarded calls are rejected', s => s.replace('| pull     | 1296 | 0       | 0', '| pull     | 1296 | 0       | 2'), /pull selector discarded calls/);
rejected('wrong target contract is rejected', s => s.replace('SpicaCashInvariantHandler  | move', 'UnknownHandler              | move'), /unexpected or malformed handler selector metrics row/);
rejected('unexpected selector is rejected', s => s.replace('| move     | 1400 |', '| mint     | 1400 |'), /unexpected or malformed handler selector metrics row/);
rejected('duplicate selector rows cannot pass', s => s.replace('| pull     | 1296 |', '| move     | 1296 |'), /unexpected or malformed handler selector metrics row/);
rejected('fabricated selector totals do not pass', s => s.replace('| move     | 1400 |', '| move     | 1399 |'), /selector calls do not sum to campaign calls/);
rejected('selector metrics moved to another campaign are rejected', s => {
  const table = metrics();
  return s.replace(table, '') + '\n' + table + '\n';
}, /expected exactly one Foundry selector metrics table/);
rejected('additional selector row cannot be included', s => s.replace('| pull     | 1296 | 0       | 0        |', '| pull     | 1296 | 0       | 0        |\n| SpicaCashInvariantHandler  | burn     | 1 | 0       | 0        |'), /expected exactly three handler selector metric rows/);
rejected('missing metrics header cannot pass', s => s.replace('Contract                   | Selector | Calls | Reverts | Discards', 'Contract                   | Selector | Fake  | Reverts | Discards'), /expected exactly one Foundry selector metrics table/);
rejected('selector columns with malformed numbers fail', s => s.replace('| move     | 1400 |', '| move     | NaN |'), /unexpected or malformed handler selector metrics row/);

test('box drawing vertical separators are accepted', () => {
  const output = fixture().replaceAll('|', '│');
  assert.equal(checkInvariantEvidence(output).valid, true);
});

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
