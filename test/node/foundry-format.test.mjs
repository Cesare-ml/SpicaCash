// SPDX-License-Identifier: MIT
// Realistic Forge selector table separators, as shown in foundry-rs/foundry#12269.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkInvariantEvidence } from '../../scripts/check-foundry-invariants.mjs';

const cases = [
  'invariant_TotalSupplyRemainsFixed',
  'invariant_TrackedBalancesConserveAllTokens',
  'invariant_NoTokensHeldByHandlerOrFixture',
];
const horizontal = '|---------------------------+----------+-------+---------+----------|';
const unicode = '│───────────────────────────┼──────────┼───────┼─────────┼──────────│';
function metrics(separator = horizontal) {
  return [
    '╭---------------------------+----------+-------+---------+----------╮',
    '| Contract                  | Selector | Calls | Reverts | Discards |',
    '+===================================================================+',
    '| SpicaCashInvariantHandler | move     | 1400  | 0       | 0        |',
    separator,
    '| SpicaCashInvariantHandler | approve  | 1400  | 0       | 0        |',
    separator,
    '| SpicaCashInvariantHandler | pull     | 1296  | 0       | 0        |',
    '╰---------------------------+----------+-------+---------+----------╯',
  ].join('\n');
}
function forgeReport(separator) {
  return [
    'No files changed, compilation skipped',
    'Ran 5 tests for test/SpicaCashInvariant.t.sol:SpicaCashInvariantTest',
    '[PASS] testInvariantTargetsOnlyTheHandler() (gas: 998)',
    '[PASS] testInvariantHandlerExercisesTransferApprovalAndPull() (gas: 998)',
    ...cases.flatMap((name) => ['[PASS] ' + name + '() (runs: 64, calls: 4096, reverts: 0)', metrics(separator)]),
    'Suite result: ok. 5 passed; 0 failed; 0 skipped; finished in 1.23s (1.23s CPU time)',
    'Ran 1 test suite in 1.23s (1.23s CPU time): 5 tests passed, 0 failed, 0 skipped',
    '',
  ].join('\n');
}
function reject(description, mutate, message) {
  test(description, () => {
    const result = checkInvariantEvidence(mutate(forgeReport(horizontal)));
    assert.equal(result.valid, false, 'Must not accept corrupted metrics');
    assert.match(result.errors.join('\n'), message);
  });
}

test('accept Forge ASCII table separator rows between every selector', () => {
  assert.deepEqual(checkInvariantEvidence(forgeReport(horizontal)), {valid: true, errors: []});
});
test('accept Forge Unicode table separator rows between every selector', () => {
  assert.deepEqual(checkInvariantEvidence(forgeReport(unicode)), {valid: true, errors: []});
});
reject('reject unknown handler even with separators', s=>s.replace('SpicaCashInvariantHandler | move', 'UnexpectedContract         | move'), /unexpected or malformed handler selector metrics row/);
reject('reject duplicate selector even with separators', s=>s.replace('Handler | pull', 'Handler | move'), /unexpected or malformed handler selector metrics row/);
reject('reject zero-call selector even with separators', s=>s.replace('Handler | move     | 1400', 'Handler | move     | 0'), /move selector was never called/);
reject('reject nonzero selector reverts even with separators', s=>s.replace('Handler | pull     | 1296  | 0 ', 'Handler | pull     | 1296  | 1 '), /pull selector reverted/);
reject('reject malformed pseudo-separator with unexpected text', s=>s.replace(horizontal, '|-------x-------------------+----------+-------+---------+----------|'), /unexpected or malformed handler selector metrics row/);
reject('reject a missing selector with separators intact', s=>s.replace('| SpicaCashInvariantHandler | approve  | 1400  | 0       | 0        |', ''), /expected exactly three handler selector metric rows/);
