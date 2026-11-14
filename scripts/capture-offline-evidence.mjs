#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Local read-only Node verification evidence. Never deploys, signs or connects to a chain.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = Object.freeze([
  '.npmrc', 'package.json', 'package-lock.json',
  'scripts/check-dependency-lock.mjs', 'scripts/run-offline-node.mjs',
  'scripts/capture-offline-evidence.mjs', 'test/node/offline-evidence.test.mjs',
]);
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_PROCESS_OUTPUT = 1024 * 1024;

export function childEnvironment(source = process.env) {
  // Inherited Node preload and npm Node options are executable-code surfaces.
  // This protects only spawned children, not the already-started parent process.
  return {
    ...source,
    NODE_OPTIONS: '',
    npm_config_node_options: '',
    NPM_CONFIG_NODE_OPTIONS: '',
    npm_config_script_shell: '',
    NPM_CONFIG_SCRIPT_SHELL: '',
  };
}

export function digestRegularFile(path) {
  if (!lstatSync(path).isFile()) throw new Error('required source is not a regular file');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
      throw new Error('required source missing, oversized or not regular');
    }
    const content = readFileSync(fd);
    if (content.length !== stat.size) throw new Error('source size changed during read');
    return createHash('sha256').update(content).digest('hex');
  } finally {
    closeSync(fd);
  }
}

export function execute(root, command, args, timeoutMs, run = spawnSync) {
  const child = run(command, args, {
    cwd: root,
    shell: false,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: MAX_PROCESS_OUTPUT,
    windowsHide: true,
    env: childEnvironment(),
  });
  return {
    exitCode: Number.isInteger(child?.status) ? child.status : null,
    stdout: typeof child?.stdout === 'string' ? child.stdout : '',
    stderr: typeof child?.stderr === 'string' ? child.stderr : '',
    error: child?.error ? 'PROCESS_ERROR_OR_TIMEOUT' : null,
    passed: !child?.error && child?.status === 0,
  };
}

export function captureEvidence(root, run = spawnSync) {
  const report = {
    schemaVersion: 1,
    capturedAtUtc: new Date().toISOString(),
    project: 'SpicaCash',
    authorization: 'NONE',
    releaseStatus: 'NOT_AUTHORIZED',
    scope: 'LOCAL_NODE_ONLY',
    excluded: ['Bash deployment guards', 'real browser', 'Foundry compilation/tests',
      'independent security/legal review', 'testnet/mainnet deployment'],
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    source: { commitSha: null, clean: false, sha256: {} },
    checks: [],
    status: 'INCOMPLETE',
  };
  try {
    if (Number(process.versions.node.split('.')[0]) < 20) {
      throw new Error('Node.js 20+ required');
    }
    const commit = execute(root, 'git', ['rev-parse', '--verify', 'HEAD'], 10000, run);
    if (!commit.passed || !/^[a-f0-9]{40,64}\s*$/u.test(commit.stdout)) {
      throw new Error('could not determine Git commit');
    }
    report.source.commitSha = commit.stdout.trim();
    // Git status from a nested directory may omit edits elsewhere in the tree.
    // Only accept a verifier located at the repository's actual worktree root.
    const prefix = execute(root, 'git', ['rev-parse', '--show-prefix'], 10000, run);
    if (!prefix.passed || prefix.stdout.trim() !== '') {
      throw new Error('evidence script must run from the Git worktree root');
    }
    const status = execute(root, 'git', ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '--untracked-files=normal'], 10000, run);
    if (!status.passed) throw new Error('could not inspect Git status');
    report.source.clean = status.stdout === '';
    if (!report.source.clean) throw new Error('working tree is not clean');
    for (const filename of FILES) {
      report.source.sha256[filename] = digestRegularFile(join(root, filename));
    }
    const steps = [
      { id: 'DEPENDENCY_POLICY', script: 'check-dependency-lock.mjs' },
      { id: 'OFFLINE_NODE', script: 'run-offline-node.mjs' },
    ];
    for (const step of steps) {
      const result = execute(root, process.execPath, [join(root, 'scripts', step.script)], 300000, run);
      report.checks.push({ id: step.id, ...result });
      if (!result.passed) {
        report.status = 'FAILED';
        return report;
      }
    }
    // Detect source changes during checks: a successful earlier preflight is not
    // evidence for a different checkout state after the tests finish.
    const finalCommit = execute(root, 'git', ['rev-parse', '--verify', 'HEAD'], 10000, run);
    const finalStatus = execute(root, 'git', ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '--untracked-files=normal'], 10000, run);
    if (!finalCommit.passed || finalCommit.stdout.trim() !== report.source.commitSha ||
        !finalStatus.passed || finalStatus.stdout !== '') {
      throw new Error('checkout changed during verification');
    }
    for (const filename of FILES) {
      if (digestRegularFile(join(root, filename)) !== report.source.sha256[filename]) {
        throw new Error('critical source changed during verification');
      }
    }
    report.status = 'PASSED_NODE_ONLY';
  } catch (error) {
    report.status = 'INCOMPLETE';
    report.failure = error instanceof Error ? error.message : 'unknown evidence failure';
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error('Usage: node scripts/capture-offline-evidence.mjs > local-evidence.json');
    process.exitCode = 2;
  } else {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const report = captureEvidence(root);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'PASSED_NODE_ONLY') process.exitCode = 1;
  }
}
