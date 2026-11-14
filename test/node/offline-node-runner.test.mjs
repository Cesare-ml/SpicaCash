// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_NODE_TESTS, planOfflineNodeSteps, runOfflineNodeSteps, cleanNodeChildEnv } from '../../scripts/run-offline-node.mjs';

const dirent = (name, regular = true) => ({ name, isFile: () => regular });
const requiredEntries = (extra = []) => [...REQUIRED_NODE_TESTS.map(name => dirent(name)), ...extra];

test('discovers all regular Node tests in deterministic order and includes four draft checks', () => {
  const root = join('test-root');
  const plan = planOfflineNodeSteps(root, requiredEntries([
    dirent('z.test.mjs'), dirent('notes.txt'), dirent('a.test.mjs'),
  ]));
  assert.equal(plan.length, 6);
  assert.deepEqual(plan[0], { label: 'reviewed dependency policy',
    args: [join(root, 'scripts', 'check-dependency-lock.mjs')] });
  const names = [...REQUIRED_NODE_TESTS, 'a.test.mjs', 'z.test.mjs'].sort();
  assert.deepEqual(plan[1].args, ['--test', '--test-concurrency=4',
    ...names.map(name => join(root, 'test', 'node', name))]);
  assert.deepEqual(plan.slice(2).map(step => step.label), [
    'tokenomics draft', 'contributor grants draft',
    'grant batches draft', 'grant manifest draft']);
});

test('refuses missing tests and disguised test directories', () => {
  assert.throws(() => planOfflineNodeSteps('repo', []), /no Node test files/);
  assert.throws(() => planOfflineNodeSteps('repo', [dirent('a.test.mjs', false)]),
    /regular files/);
});

test('removes case-variant Node startup options without mutating the source', () => {
  const inherited = {
    PATH: '/reviewed/bin', HOME: '/reviewed/home',
    NODE_OPTIONS: '--require ./untrusted.cjs',
    Node_Options: '--import ./untrusted.mjs',
    npm_config_node_options: '--require ./inherited.cjs',
    NODE_PATH: '/unreviewed/global-modules',
    Node_Path: '/unreviewed/case-variant',
    NPM_CONFIG_NODE_OPTIONS: '--import ./inherited.mjs'
  };
  const safe = cleanNodeChildEnv(inherited);
  assert.deepEqual(safe, { PATH: '/reviewed/bin', HOME: '/reviewed/home' });
  assert.equal(inherited.NODE_OPTIONS, '--require ./untrusted.cjs');
  assert.equal(inherited.NODE_PATH, '/unreviewed/global-modules');
  assert.equal(inherited.NPM_CONFIG_NODE_OPTIONS, '--import ./inherited.mjs');
});

test('sanitizes each child before policy preflight, regression tests and draft checks', () => {
  const plan = planOfflineNodeSteps('repo', requiredEntries());
  const source = { PATH: '/trusted/bin', NODE_PATH: '/unreviewed/modules', NODE_OPTIONS: '--require ./unsafe.cjs',
    npm_config_node_options: '--import ./unsafe.mjs' };
  const received = [];
  const result = runOfflineNodeSteps('repo', plan, (bin, args, options) => {
    received.push(options);
    return { status: 0 };
  }, source);
  assert.deepEqual(result, { ok: true });
  assert.equal(received.length, plan.length);
  for (const options of received) {
    assert.deepEqual(options.env, { PATH: '/trusted/bin' });
    assert.equal(options.shell, false);
  }
});

test('actual Node child ignores an inherited unsafe startup option', () => {
  const source = { ...process.env,
    NODE_OPTIONS: '--not-a-reviewed-node-option',
    npm_config_node_options: '--require ./non-existent-preload.cjs' };
  const unsafe = spawnSync(process.execPath, ['-e', 'process.exit(0)'], {
    cwd: process.cwd(), env: source, encoding: 'utf8', windowsHide: true
  });
  assert.notEqual(unsafe.status, 0, 'the unfiltered inherited option must be rejected');
  const steps = [{ label: 'harmless offline Node child',
    args: ['-e', 'process.exit(process.env.NODE_OPTIONS || process.env.npm_config_node_options ? 1 : 0)'] }];
  assert.deepEqual(runOfflineNodeSteps(process.cwd(), steps, spawnSync, source), { ok: true });
});

test('real Node child cannot resolve CommonJS from inherited NODE_PATH', () => {
  const foreign = mkdtempSync(join(tmpdir(), 'spica-foreign-node-path-'));
  try {
    const moduleDirectory = join(foreign, 'spica-unreviewed-probe');
    mkdirSync(moduleDirectory);
    writeFileSync(join(moduleDirectory, 'index.js'), 'module.exports = 17;\n');
    const env = { ...process.env, NODE_PATH: foreign };
    const unfiltered = spawnSync(process.execPath,
      ['-e', "process.exit(require('spica-unreviewed-probe') === 17 ? 0 : 2)"],
      { env, cwd: foreign, encoding: 'utf8', shell: false });
    assert.equal(unfiltered.status, 0, 'fixture must prove NODE_PATH injection works');
    const steps = [{ label: 'module-path isolation',
      args: ['-e', "try { require('spica-unreviewed-probe'); process.exit(1); } catch (error) { process.exit(error.code === 'MODULE_NOT_FOUND' ? 0 : 2); }"] }];
    assert.deepEqual(runOfflineNodeSteps(foreign, steps, spawnSync, env), { ok: true });
  } finally {
    rmSync(foreign, { recursive: true, force: true });
  }
});

test('runs every step without a shell and reports success only after all steps', () => {
  const plan = planOfflineNodeSteps('repo', requiredEntries([dirent('core.test.mjs')]));
  const calls = [];
  const response = runOfflineNodeSteps('repo', plan, (bin, args, options) => {
    calls.push({ bin, args, options });
    return { status: 0 };
  });
  assert.deepEqual(response, { ok: true });
  assert.equal(calls.length, 6);
  assert.ok(calls.every(call => call.bin === process.execPath &&
    call.options.shell === false && call.options.cwd === 'repo'));
});

test('stops immediately on a failed Node step and cannot print success', () => {
  const plan = planOfflineNodeSteps('repo', requiredEntries([dirent('core.test.mjs')]));
  let count = 0;
  const response = runOfflineNodeSteps('repo', plan, () => {
    count++;
    return { status: count === 3 ? 1 : 0 };
  });
  assert.deepEqual(response, { ok: false, failed: 'tokenomics draft' });
  assert.equal(count, 3);
});

test('dependency policy failure prevents tests and draft CLI execution', () => {
  const plan = planOfflineNodeSteps('repo', requiredEntries());
  let calls = 0;
  const response = runOfflineNodeSteps('repo', plan, () => {
    calls++;
    return { status: 1 };
  });
  assert.deepEqual(response, { ok: false, failed: 'reviewed dependency policy' });
  assert.equal(calls, 1);
});

test('aborted Node test process fails closed after successful preflight', () => {
  const plan = planOfflineNodeSteps('repo', requiredEntries());
  let calls = 0;
  const response = runOfflineNodeSteps('repo', plan, () =>
    ++calls === 1 ? { status: 0 } : { status: null, signal: 'SIGTERM' });
  assert.deepEqual(response, { ok: false, failed: 'all Node regression tests' });
  assert.equal(calls, 2);
});

test('fails closed if any mandatory security regression suite is removed', () => {
  for (const removed of REQUIRED_NODE_TESTS) {
    const remaining = requiredEntries().filter(entry => entry.name !== removed);
    assert.throws(() => planOfflineNodeSteps('repo', remaining), error =>
      error.message.includes('missing required Node test suites: ' + removed), removed);
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
  ])).length, 6);
});

test('viewer browser plan and offline demo suites are mandatory', () => {
  for (const filename of ['browser-smoke-plan.test.mjs', 'local-demo-viewer.test.mjs']) {
    assert.ok(REQUIRED_NODE_TESTS.includes(filename));
    assert.throws(() =>
      planOfflineNodeSteps('repo', requiredEntries().filter(entry => entry.name !== filename)),
      /missing required Node test suites/);
  }
});

test('Foundry profile regression is mandatory before any tests run', () => {
  const file = 'foundry-config-guard.test.mjs';
  assert.ok(REQUIRED_NODE_TESTS.includes(file));
  assert.throws(() =>
    planOfflineNodeSteps('repo', requiredEntries().filter(entry => entry.name !== file)),
    /missing required Node test suites/);
});

test('local verification evidence regression cannot be removed silently', () => {
  const file = 'local-verification-evidence.test.mjs';
  assert.ok(REQUIRED_NODE_TESTS.includes(file));
  assert.throws(() =>
    planOfflineNodeSteps('repo', requiredEntries().filter(entry => entry.name !== file)),
    /missing required Node test suites/);
});

test('offline-only evidence regression cannot be omitted from the mandatory suite', () => {
  const file = 'offline-evidence.test.mjs';
  assert.ok(REQUIRED_NODE_TESTS.includes(file));
  assert.throws(() =>
    planOfflineNodeSteps('repo', requiredEntries().filter(entry => entry.name !== file)),
    /missing required Node test suites/);
});

test('required suite list is present in the actual repository test folder', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const entries = readdirSync(join(root, 'test', 'node'), { withFileTypes: true });
  assert.doesNotThrow(() => planOfflineNodeSteps(root, entries));
  assert.equal(REQUIRED_NODE_TESTS.length, 22);
});
