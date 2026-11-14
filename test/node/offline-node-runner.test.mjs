// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { planOfflineNodeSteps, runOfflineNodeSteps } from '../../scripts/run-offline-node.mjs';

const dirent = (name, regular = true) => ({ name, isFile: () => regular });

test('discovers all regular Node tests in deterministic order and includes four draft checks', () => {
  const root = join('test-root');
  const plan = planOfflineNodeSteps(root, [
    dirent('z.test.mjs'), dirent('notes.txt'), dirent('a.test.mjs'),
  ]);
  assert.equal(plan.length, 5);
  assert.deepEqual(plan[0].args, ['--test', '--test-concurrency=4',
    join(root, 'test', 'node', 'a.test.mjs'),
    join(root, 'test', 'node', 'z.test.mjs')]);
  assert.deepEqual(plan.slice(1).map(step => step.label), [
    'tokenomics draft', 'contributor grants draft',
    'grant batches draft', 'grant manifest draft']);
});

test('refuses missing tests and disguised test directories', () => {
  assert.throws(() => planOfflineNodeSteps('repo', []), /no Node test files/);
  assert.throws(() => planOfflineNodeSteps('repo', [dirent('a.test.mjs', false)]),
    /regular files/);
});

test('runs every step without a shell and reports success only after all steps', () => {
  const plan = planOfflineNodeSteps('repo', [dirent('core.test.mjs')]);
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
  const plan = planOfflineNodeSteps('repo', [dirent('core.test.mjs')]);
  let count = 0;
  const response = runOfflineNodeSteps('repo', plan, () => {
    count++;
    return { status: count === 2 ? 1 : 0 };
  });
  assert.deepEqual(response, { ok: false, failed: 'tokenomics draft' });
  assert.equal(count, 2);
});

test('aborted child processes fail closed', () => {
  const plan = planOfflineNodeSteps('repo', [dirent('core.test.mjs')]);
  const response = runOfflineNodeSteps('repo', plan, () => ({ status: null, signal: 'SIGTERM' }));
  assert.deepEqual(response, { ok: false, failed: 'all Node regression tests' });
});
