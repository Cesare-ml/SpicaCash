#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Shell-independent offline checks. Never signs, deploys, or accesses a network.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DRAFT_CHECKS = [
  ['tokenomics draft', 'validate-tokenomics.mjs', 'tokenomics.draft.json'],
  ['contributor grants draft', 'validate-contributor-grants.mjs', 'contributor-grants.draft.json'],
  ['grant batches draft', 'check-grant-batches.mjs', 'contributor-grants.draft.json'],
  ['grant manifest draft', 'check-grant-manifest.mjs', 'grant-batches.draft.manifest.json'],
];

// A deleted or renamed security regression must never produce a green run.
// Additional *.test.mjs files are still discovered automatically.
export const REQUIRED_NODE_TESTS = Object.freeze([
  'abi-check.test.mjs',
  'contributor-grants.test.mjs',
  'dependency-lock.test.mjs',
  'distinct-batch-files.test.mjs',
  'foundry-evidence.test.mjs',
  'foundry-format.test.mjs',
  'grant-batches.test.mjs',
  'grant-inventory.test.mjs',
  'grant-manifest.test.mjs',
  'launch-readiness.test.mjs',
  'offline-node-runner.test.mjs',
  'parse-review-json.test.mjs',
  'proposal-cli-integration.test.mjs',
  'read-small-file.test.mjs',
  'review-json-manifest.test.mjs',
  'rpc-url.test.mjs',
  'strict-cli-json.test.mjs',
  'tokenomics.test.mjs',
]);

export function planOfflineNodeSteps(root, entries) {
  if (!Array.isArray(entries)) throw new Error('test directory entries required');
  // A case-variant suffix is silently skipped on some platforms; fail closed.
  const noncanonical = entries.find(entry => /\.test\.mjs$/i.test(entry.name) &&
    !entry.name.endsWith('.test.mjs'));
  if (noncanonical) {
    throw new Error('Node test filenames must use lowercase .test.mjs: ' + noncanonical.name);
  }
  const tests = entries.filter(entry => entry.name.endsWith('.test.mjs'));
  if (tests.some(entry => !entry.isFile())) {
    throw new Error('all .test.mjs entries must be regular files');
  }
  const names = tests.map(entry => entry.name).sort();
  if (names.length === 0) throw new Error('no Node test files found; refusing partial verification');
  const folded = new Set();
  for (const name of names) {
    const key = name.toLowerCase();
    if (folded.has(key)) throw new Error('ambiguous case-insensitive Node test filename: ' + name);
    folded.add(key);
  }
  const missing = REQUIRED_NODE_TESTS.filter(name => !names.includes(name));
  if (missing.length > 0) {
    throw new Error('missing required Node test suites: ' + missing.join(', '));
  }
  return [
    { label: 'all Node regression tests', args: ['--test', '--test-concurrency=4',
      ...names.map(name => join(root, 'test', 'node', name))] },
    ...DRAFT_CHECKS.map(([label, script, config]) => ({
      label,
      args: [join(root, 'scripts', script), join(root, 'config', config)],
    })),
  ];
}

export function runOfflineNodeSteps(root, steps, execute = spawnSync) {
  for (const step of steps) {
    const response = execute(process.execPath, step.args,
      { cwd: root, stdio: 'inherit', shell: false });
    if (response?.error) throw response.error;
    if (response?.status !== 0) {
      return { ok: false, failed: step.label };
    }
  }
  return { ok: true };
}

function main() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const entries = readdirSync(join(root, 'test', 'node'), { withFileTypes: true });
    const steps = planOfflineNodeSteps(root, entries);
    const result = runOfflineNodeSteps(root, steps);
    if (!result.ok) {
      console.error('FAILED Node-only offline check: ' + result.failed);
      process.exitCode = 1;
      return;
    }
    console.log('Node-only offline checks passed. Bash deploy guards, Foundry tests and audit NOT run.');
  } catch (error) {
    console.error('Node-only offline checks could not complete: ' + error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
