// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_NODE_TESTS, planOfflineNodeSteps, runOfflineNodeSteps } from '../../scripts/run-offline-node.mjs';

const dirent = (name, regular = true) => ({ name, isFile: () => regular });
const requiredEntries = (extra = []) => [...REQUIRED_NODE_TESTS.map(name => dirent(name)), ...extra];

test('discovers all regular Node tests in deterministic order and includes four draft checks', () => {
  const root = join('test-root');
  const plan = planOfflineNodeSteps(root, requiredEntries([
    dirent('z.test.mjs'), dirent('notes.txt'), dirent('a.test.mjs'),
  ]));
  assert.equal(plan.length, 5);
  const names = [...REQUIRED_NODE_TESTS, 'a.test.mjs', 'z.test.mjs'].sort();
  assert.deepEqual(plan[0].args, ['--test', '--test-concurrency=4',
    ...names.map(name => join(root, 'test', 'node', name))]);
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
  const plan = planOfflineNodeSteps('repo', requiredEntries([dirent('core.test.mjs')]));
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
  const plan = planOfflineNodeSteps('repo', requiredEntries([dirent('core.test.mjs')]));
  let count = 0;
  const response = runOfflineNodeSteps('repo', plan, () => {
    count++;
    return { status: count === 2 ? 1 : 0 };
  });
  assert.deepEqual(response, { ok: false, failed: 'tokenomics draft' });
  assert.equal(count, 2);
});

test('aborted child processes fail closed', () => {
  const plan = planOfflineNodeSteps('repo', requiredEntries([dirent('core.test.mjs')]));
  const response = runOfflineNodeSteps('repo', plan, () => ({ status: null, signal: 'SIGTERM' }));
  assert.deepEqual(response, { ok: false, failed: 'all Node regression tests' });
});

test('fails closed if any mandatory security regression suite is removed', () => {
  for (const removed of REQUIRED_NODE_TESTS) {
    const remaining = requiredEntries().filter(entry => entry.name !== removed);
    assert.throws(() => planOfflineNodeSteps('repo', remaining), error =>
      error.message.includes('missing required Node test suites: ' + removed), removed);
  }
});

test('both offline viewer suites are mandatory and cannot be silently dropped', () => {
  const viewerSuites = ['browser-smoke-plan.test.mjs', 'local-demo-viewer.test.mjs'];
  for (const suite of viewerSuites) {
    assert.ok(REQUIRED_NODE_TESTS.includes(suite), 'missing mandatory registration: ' + suite);
    const without = requiredEntries().filter(entry => entry.name !== suite);
    assert.throws(() => planOfflineNodeSteps('repo', without),
      error => error.message.includes('missing required Node test suites: ' + suite),
      'viewer regression cannot be skipped: ' + suite);
  }
});

test('refuses case-colliding test names (Windows-compatible behavior)', () => {
  assert.throws(() => planOfflineNodeSteps('repo', requiredEntries([
    dirent('Tokenomics.test.mjs'),
  ])), /ambiguous case-insensitive Node test filename/);
});

test('refuses case-variant Node test suffixes before running any test', () => {
  for (const filename of ['hidden.test.MJS', 'hidden.TEST.mjs', 'hidden.Test.Mjs']) {
    assert.throws(() => planOfflineNodeSteps('repo', requiredEntries([
      dirent(filename)
    ])), /Node test filenames must use lowercase \.test\.mjs/);
  }
  // Notes and unrelated files are not test suites.
  assert.equal(planOfflineNodeSteps('repo', requiredEntries([
    dirent('README.MD'), dirent('notes.TXT'),
  ])).length, 5);
});

test('required suite list is present in the actual repository test folder', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const entries = readdirSync(join(root, 'test', 'node'), { withFileTypes: true });
  assert.doesNotThrow(() => planOfflineNodeSteps(root, entries));
  assert.equal(REQUIRED_NODE_TESTS.length, 19);
});
