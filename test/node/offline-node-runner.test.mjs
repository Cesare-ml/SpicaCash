// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { REQUIRED_TEST_SUITES, planOfflineNodeSteps, runOfflineNodeSteps } from '../../scripts/run-offline-node.mjs';

const dirent = (name, regular = true) => ({ name, isFile: () => regular });
const fullEntries = () => REQUIRED_TEST_SUITES.map(name => dirent(name));

test('discovers all regular Node tests in deterministic order and includes four draft checks', () => {
  const root = join('test-root');
  const plan = planOfflineNodeSteps(root, [
    ...fullEntries(), dirent('z-new.test.mjs'), dirent('notes.txt'),
  ]);
  assert.equal(plan.length, 5);
  assert.deepEqual(plan[0].args, ['--test', '--test-concurrency=4',
    ...[...REQUIRED_TEST_SUITES, 'z-new.test.mjs'].sort()
      .map(name => join(root, 'test', 'node', name))]);
  assert.deepEqual(plan.slice(1).map(step => step.label), [
    'tokenomics draft', 'contributor grants draft',
    'grant batches draft', 'grant manifest draft']);
});

test('refuses missing tests and disguised test directories', () => {
  assert.throws(() => planOfflineNodeSteps('repo', []), /no Node test files/);
  assert.throws(() => planOfflineNodeSteps('repo', [
    ...fullEntries(), dirent('extra.test.mjs', false)]), /regular files/);
  assert.throws(() => planOfflineNodeSteps('repo', [
    ...fullEntries().filter(entry => entry.name !== 'tokenomics.test.mjs')]),
    /missing required Node test suites: tokenomics\.test\.mjs/);
  assert.throws(() => planOfflineNodeSteps('repo', [dirent('tokenomics.test.mjs')]),
    /missing required Node test suites/);
});

test('runs every step without a shell and reports success only after all steps', () => {
  const plan = planOfflineNodeSteps('repo', fullEntries());
  const calls = [];
  const response = runOfflineNodeSteps('repo', plan, (bin, args, options) => {
    calls.push({ bin, args, options });
    return { status: 0 };
  });
  assert.deepEqual(response, { ok: true });
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => call.bin === process.execPath &&
    call.options.shell === false && call.options.cwd === 'repo'));
});

test('stops immediately on a failed Node step and cannot print success', () => {
  const plan = planOfflineNodeSteps('repo', fullEntries());
  let count = 0;
  const response = runOfflineNodeSteps('repo', plan, () => {
    count++;
    return { status: count === 2 ? 1 : 0 };
  });
  assert.deepEqual(response, { ok: false, failed: 'tokenomics draft' });
  assert.equal(count, 2);
});

test('aborted child processes fail closed', () => {
  const plan = planOfflineNodeSteps('repo', fullEntries());
  const response = runOfflineNodeSteps('repo', plan, () => ({ status: null, signal: 'SIGTERM' }));
  assert.deepEqual(response, { ok: false, failed: 'all Node regression tests' });
});
