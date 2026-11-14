#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Collect a minimal, locally stored, non-authorizing verification receipt.
// Does not deploy, sign, access an RPC, or retain full tool output.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSmallBytes } from './read-small-file.mjs';

const INPUTS = Object.freeze([
  'src/SpicaCash.sol',
  'foundry.toml',
  'package-lock.json',
  'scripts/verify-local.sh',
  'scripts/check-foundry-config.mjs',
  'scripts/check-foundry-invariants.mjs'
]);

const SENSITIVE_NAMES = new Set([
  'NODE_OPTIONS', 'npm_config_node_options', 'NPM_CONFIG_NODE_OPTIONS',
  'ETH_RPC_URL', 'ARBITRUM_SEPOLIA_RPC_URL',
  'FOUNDRY_FORK_URL', 'FOUNDRY_RPC_URL', 'FOUNDRY_ACCOUNT',
  'SPICA_CONFIRM_TESTNET_DEPLOY',
  // Bash sources BASH_ENV before executing verify-local.sh; exported shell
  // functions can shadow trusted commands. Git/NPM/loader options can also
  // alter subprocess behavior before any repository policy check can run.
  // Normalize standalone sensitive names for Windows/case-varied env inputs.
  'BASH_ENV', 'ENV', 'CDPATH', 'SHELLOPTS', 'BASHOPTS'
].map(name => name.toUpperCase()));
const BLOCKED_CHILD_PREFIX = /^(?:FOUNDRY_|DAPP_|GIT_|NPM_CONFIG_|NODE_|BASH_FUNC_|LD_|DYLD_)/i;

export function cleanVerificationEnv(source) {
  const env = Object.create(null);
  for (const [key, value] of Object.entries(source)) {
    if (SENSITIVE_NAMES.has(key.toUpperCase()) || BLOCKED_CHILD_PREFIX.test(key)) continue;
    env[key] = value;
  }
  env.NO_COLOR = '1';
  return env;
}

function invoke(run, command, args, { cwd, env, inherit = false }) {
  const result = run(command, args, {
    cwd, env, shell: false, windowsHide: true,
    stdio: inherit ? 'inherit' : 'pipe',
    ...(inherit ? {} : { encoding: 'utf8', timeout: 10_000, maxBuffer: 65_536 })
  });
  if (result?.error || typeof result?.status !== 'number' || result.status !== 0) {
    return { ok: false, output: '', status: result?.status ?? null, signal: result?.signal ?? null };
  }
  return { ok: true, output: inherit ? '' : String(result.stdout || ''), status: 0, signal: null };
}

function checkedText(run, command, args, root, env) {
  const result = invoke(run, command, args, { cwd: root, env });
  if (!result.ok) throw new Error('Prerequisite command failed: ' + command);
  return result.output.trim();
}

function inputHashes(root) {
  const result = {};
  for (const name of INPUTS) {
    const bytes = readSmallBytes(join(root, name));
    result[name] = createHash('sha256').update(bytes).digest('hex');
  }
  return result;
}

function evidenceDirectory(root) {
  const directory = join(root, '.spica-evidence');
  if (existsSync(directory)) {
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('Local evidence destination must be a real directory');
    }
  } else {
    mkdirSync(directory, { mode: 0o700 });
  }
  return directory;
}

export function captureLocalVerification({
  root, run = spawnSync, env = process.env, now = new Date(),
  nodeVersion = process.version, platform = process.platform
}) {
  if (!root || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error('Invalid local evidence context');
  }
  const project = resolve(root);
  const safeEnv = cleanVerificationEnv(env);

  // Require an ordinary, clean Git checkout; do not associate observations
  // with the wrong tree or write evidence for modified/untracked code.
  const top = resolve(checkedText(run, 'git', ['rev-parse', '--show-toplevel'], project, safeEnv));
  if (top !== project) throw new Error('Not executing in the Git checkout root');
  const commit = checkedText(run, 'git', ['rev-parse', 'HEAD'], project, safeEnv);
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Unrecognized commit hash');
  const dirty = checkedText(run, 'git',
    ['status', '--porcelain=v1', '--untracked-files=normal'], project, safeEnv);
  if (dirty !== '') throw new Error('Checkout is dirty; refusing evidence capture');

  const hashes = inputHashes(project);
  const timestamp = now.toISOString();
  const forge = invoke(run, 'forge', ['--version'], { cwd: project, env: safeEnv });
  const forgeLine = forge.ok ? forge.output.split(/\r?\n/, 1)[0] : '';
  const safeForgeVersion = /^forge Version: [A-Za-z0-9._+-]{1,40}$/.test(forgeLine)
    ? forgeLine : 'unavailable';

  // The reviewed verifier is the only command run here; its output streams
  // directly to the terminal and is never collected in this receipt.
  const verification = forge.ok
    ? invoke(run, 'bash', ['scripts/verify-local.sh'],
      { cwd: project, env: safeEnv, inherit: true })
    : { ok: false, status: null, signal: null };

  // A successful exit code is not evidence when the checked-in inputs
  // changed while the gate was executing. Recheck even on failure.
  const afterStatus = checkedText(run, 'git',
    ['status', '--porcelain=v1', '--untracked-files=normal'], project, safeEnv);
  const afterHashes = inputHashes(project);
  const inputsStable = afterStatus === '' && INPUTS.every(
    name => hashes[name] === afterHashes[name]
  );
  const status = !inputsStable ? 'INVALIDATED'
    : !forge.ok ? 'BLOCKED' : verification.ok ? 'PASS' : 'FAIL';
  const record = {
    schema: 'spicacash.local-verification.v1',
    executedAtUTC: timestamp,
    gitCommit: commit,
    workingTreeCleanBeforeRun: true,
    inputsStableAfterRun: inputsStable,
    nodeVersion,
    forgeVersion: safeForgeVersion,
    platform,
    inputSha256: hashes,
    attemptedCommand: forge.ok ? 'bash scripts/verify-local.sh' : null,
    verifierExitCode: verification.status,
    verifierSignal: verification.signal,
    verificationStatus: status,
    releaseAuthorized: false,
    auditCompleted: false,
    note: 'LOCAL OBSERVATION ONLY. A receipt is not proof of genuine executables, a full audit, token issuance authorization or independent review.'
  };

  const directory = evidenceDirectory(project);
  const stamp = timestamp.replace(/[^0-9]/g, '').slice(0, 14);
  const filename = 'verification-' + commit.slice(0, 12) + '-' + stamp + '.json';
  const outputPath = join(directory, filename);
  // Exclusive creation prevents overwriting another report; the folder is
  // gitignored and file permissions are restrictive where supported.
  writeFileSync(outputPath, JSON.stringify(record, null, 2) + '\n',
    { flag: 'wx', mode: 0o600, encoding: 'utf8' });
  return { record, outputPath };
}

function main() {
  try {
    if (process.argv.length !== 2) {
      throw new Error('Usage: node scripts/capture-local-verification.mjs');
    }
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const { record, outputPath } = captureLocalVerification({ root });
    console.log('Local verification status: ' + record.verificationStatus);
    console.log('Local receipt saved (ignored by Git): ' + outputPath);
    console.log('No private keys, RPC values, raw logs or deployment addresses are recorded.');
    console.log('This receipt does NOT authorize issuance, trading or mainnet deployment.');
    if (record.verificationStatus !== 'PASS') process.exitCode = 1;
  } catch (error) {
    // Avoid printing third-party tool output, environment values or paths.
    console.error('Unable to capture valid local verification evidence: ' + error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
