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

export function planOfflineNodeSteps(root, entries) {
  if (!Array.isArray(entries)) throw new Error('test directory entries required');
  const tests = entries.filter(entry => entry.name.endsWith('.test.mjs'));
  if (tests.some(entry => !entry.isFile())) {
    throw new Error('all .test.mjs entries must be regular files');
  }
  const names = tests.map(entry => entry.name).sort();
  if (names.length === 0) throw new Error('no Node test files found; refusing partial verification');
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
