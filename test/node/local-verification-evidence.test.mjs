// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync,
  symlinkSync, existsSync, statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import {
  captureLocalVerification, cleanVerificationEnv
} from '../../scripts/capture-local-verification.mjs';

const FILES = [
  'src/SpicaCash.sol',
  'foundry.toml',
  'package-lock.json',
  'scripts/verify-local.sh',
  'scripts/check-foundry-config.mjs',
  'scripts/check-foundry-invariants.mjs'
];
const SHA = 'a'.repeat(40);
const TIME = new Date('2026-11-14T12:34:56.000Z');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'spica-evidence-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of FILES) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'synthetic fixture: ' + file + '\n');
  }
  return root;
}

function mockedCommands(root, { dirty = '', forge = true, gate = 0, wrongRoot = false } = {}) {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    assert.equal(options.shell, false);
    assert.equal(options.cwd, resolve(root));
    assert.equal(options.env.NODE_OPTIONS, undefined);
    assert.equal(options.env.ETH_RPC_URL, undefined);
    assert.equal(options.env.FOUNDRY_PROFILE, undefined);
    assert.equal(options.env.DAPP_TEST_FUZZ_RUNS, undefined);
    for (const key of Object.keys(options.env)) {
      assert.doesNotMatch(key, /^(?:FOUNDRY_|DAPP_|GIT_|NPM_CONFIG_|NODE_|BASH_FUNC_|LD_|DYLD_)/i,
        'untrusted override reached ' + command + ': ' + key);
    }
    for (const key of ['BASH_ENV', 'ENV', 'CDPATH', 'SHELLOPTS', 'BASHOPTS']) {
      assert.equal(options.env[key], undefined, 'unsafe shell startup ' + key);
    }
    if (command === 'git') {
      const subcommand = args.slice(0, 2).join(' ');
      if (subcommand === 'rev-parse --show-toplevel') {
        return { status: 0, stdout: wrongRoot ? dirname(root) : resolve(root) };
      }
      if (subcommand === 'rev-parse HEAD') return { status: 0, stdout: SHA };
      if (subcommand === 'rev-parse --verify' && args[2]?.startsWith('HEAD:')) {
        return { status: 0, stdout: SHA };
      }
      if (subcommand === 'hash-object --' && FILES.includes(args[2])) {
        return { status: 0, stdout: SHA };
      }
      if (subcommand === 'status --porcelain=v1') return { status: 0, stdout: dirty };
      throw new Error('unexpected git command');
    }
    if (command === 'forge' && args.join(' ') === '--version') {
      return forge
        ? { status: 0, stdout: 'forge Version: 1.2.3\nCommit SHA: synthetic' }
        : { status: null, error: new Error('forge not installed') };
    }
    if (command === 'bash' && args.join(' ') === 'scripts/verify-local.sh') {
      assert.equal(options.stdio, 'inherit');
      return { status: gate };
    }
    throw new Error('unexpected command: ' + command);
  };
  return { run, calls };
}

const poisonedEnv = Object.freeze({
  PATH: '/fake-safe-tools',
  NODE_OPTIONS: '--require ./preload.cjs',
  npm_config_node_options: '--require ./other.cjs',
  NPM_CONFIG_NODE_OPTIONS: '--require ./other.cjs',
  ETH_RPC_URL: 'https://example.invalid/SECRET',
  ARBITRUM_SEPOLIA_RPC_URL: 'https://example.invalid/SECRET',
  FOUNDRY_PROFILE: 'mainnet',
  FOUNDRY_FUZZ_RUNS: '1',
  DAPP_TEST_FUZZ_RUNS: '1',
  FOUNDRY_ACCOUNT: 'SECRET',
  SPICA_CONFIRM_TESTNET_DEPLOY: 'YES_ARBITRUM_SEPOLIA_ONLY',
  BASH_ENV: '/tmp/evil-shell-bootstrap',
  ENV: '/tmp/evil-shell-env',
  CDPATH: '/tmp/unsafe-cd',
  SHELLOPTS: 'extdebug',
  BASHOPTS: 'extglob',
  'BASH_FUNC_node%%': '() { echo unexpected; }',
  GIT_DIR: '/tmp/other-repo/.git',
  GIT_WORK_TREE: '/tmp/other-repo',
  GIT_INDEX_FILE: '/tmp/other-index',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.hooksPath',
  GIT_CONFIG_VALUE_0: '/tmp/fake-hooks',
  npm_config_script_shell: '/tmp/fake-shell',
  NPM_CONFIG_SCRIPT_SHELL: '/tmp/fake-shell',
  NODE_PATH: '/tmp/fake-modules',
  LD_PRELOAD: '/tmp/fake-inject.so',
  LD_LIBRARY_PATH: '/tmp/fake-libs',
  DYLD_INSERT_LIBRARIES: '/tmp/fake-inject.dylib',
  BaSh_EnV: '/tmp/untrusted-startup',
  bashopts: 'extdebug',
  env: '/tmp/untrusted-shell-config',
  eth_rpc_url: 'https://example.invalid/private',
  ArBiTrUm_SePoLiA_rPc_Url: 'https://example.invalid/private',
  spica_confirm_testnet_deploy: 'YES_ARBITRUM_SEPOLIA_ONLY'
});

test('cleans inherited injection/network/signing environment without echoing values', () => {
  const safe = cleanVerificationEnv(poisonedEnv);
  assert.equal(safe.PATH, poisonedEnv.PATH);
  assert.equal(safe.NO_COLOR, '1');
  for (const key of Object.keys(poisonedEnv)) {
    if (key !== 'PATH') assert.equal(safe[key], undefined, key);
  }
});

test('preserves ordinary tool lookup but drops mixed-case child environment overrides', () => {
  const source = {
    PATH: '/trusted/bin', HOME: '/home/example', TEMP: '/tmp/example',
    LANG: 'C.UTF-8', DISPLAY: ':0',
    git_config_count: '1', Git_Work_Tree: '/tmp/other',
    Npm_Config_Script_Shell: '/tmp/untrusted', Node_Path: '/tmp/injected',
    'bAsH_FuNc_git%%': '() { echo malicious; }', dYlD_insert_libraries: '/tmp/lib.dylib',
    ld_preload: '/tmp/inject.so', DaPp_FfI: 'true',
    FOUNDRY_PROFILE: 'unreviewed', BASH_ENV: '/tmp/startup'
  };
  const actual = cleanVerificationEnv(source);
  assert.equal(actual.PATH, source.PATH);
  assert.equal(actual.HOME, source.HOME);
  assert.equal(actual.TEMP, source.TEMP);
  assert.equal(actual.LANG, source.LANG);
  assert.equal(actual.DISPLAY, source.DISPLAY);
  assert.equal(actual.NO_COLOR, '1');
  for (const key of Object.keys(source).slice(5)) {
    assert.equal(actual[key], undefined, 'untrusted key survived: ' + key);
  }
});

test('writes only a local, gitignored, git-pinned PASS summary on success', t => {
  const root = fixture(t);
  const { run, calls } = mockedCommands(root);
  const { record, outputPath } = captureLocalVerification({
    root, run, env: poisonedEnv, now: TIME, nodeVersion: 'v22.0.0', platform: 'linux'
  });
  assert.equal(record.schema, 'spicacash.local-verification.v1');
  assert.equal(record.gitCommit, SHA);
  assert.equal(record.verificationStatus, 'PASS');
  assert.equal(record.verifierExitCode, 0);
  assert.equal(record.releaseAuthorized, false);
  assert.equal(record.auditCompleted, false);
  assert.equal(record.forgeVersion, 'forge Version: 1.2.3');
  assert.equal(record.nodeVersion, 'v22.0.0');
  assert.equal(record.executedAtUTC, TIME.toISOString());
  assert.equal(Object.keys(record.inputSha256).length, FILES.length);
  assert.ok(Object.values(record.inputSha256).every(d => /^[a-f0-9]{64}$/.test(d)));
  assert.equal(calls.filter(x => x.command === 'bash').length, 1);
  assert.ok(outputPath.startsWith(join(root, '.spica-evidence')));
  assert.deepEqual(JSON.parse(readFileSync(outputPath, 'utf8')), record);
  assert.equal(statSync(outputPath).isFile(), true);
  const contents = readFileSync(outputPath, 'utf8');
  assert.doesNotMatch(contents, /SECRET|example\.invalid|preload\.cjs|mainnet/);
});

test('failed verification is captured as FAIL with a nonzero status', t => {
  const root = fixture(t);
  const { run } = mockedCommands(root, { gate: 42 });
  const { record } = captureLocalVerification({ root, run, env: poisonedEnv, now: TIME });
  assert.equal(record.verificationStatus, 'FAIL');
  assert.equal(record.verifierExitCode, 42);
  assert.equal(record.releaseAuthorized, false);
});

test('missing Foundry is BLOCKED and never invokes the verification gate', t => {
  const root = fixture(t);
  const { run, calls } = mockedCommands(root, { forge: false });
  const { record } = captureLocalVerification({ root, run, env: poisonedEnv, now: TIME });
  assert.equal(record.verificationStatus, 'BLOCKED');
  assert.equal(record.verifierExitCode, null);
  assert.equal(record.attemptedCommand, null);
  assert.equal(calls.some(x => x.command === 'bash'), false);
});

test('dirty or wrong checkout cannot produce misleading evidence', t => {
  const root = fixture(t);
  for (const variant of [{ dirty: ' M src/SpicaCash.sol\n' }, { wrongRoot: true }]) {
    const { run, calls } = mockedCommands(root, variant);
    assert.throws(() => captureLocalVerification({ root, run, env: poisonedEnv, now: TIME }),
      /Checkout is dirty|Not executing in the Git checkout root/);
    assert.equal(calls.some(x => x.command === 'forge' || x.command === 'bash'), false);
  }
  assert.equal(existsSync(join(root, '.spica-evidence')), false);
});

test('rejects malformed Git commit IDs before querying Forge', t => {
  const root = fixture(t);
  const { run: baseline, calls } = mockedCommands(root);
  const malformedIds = [
    'a'.repeat(39),
    'a'.repeat(41),
    'b'.repeat(63),
    'c'.repeat(65),
    'g'.repeat(40),
    'A'.repeat(40)
  ];

  for (const commit of malformedIds) {
    const run = (command, args, options) => {
      if (command === 'git' && args.join(' ') === 'rev-parse HEAD') {
        return { status: 0, stdout: commit };
      }
      return baseline(command, args, options);
    };
    assert.throws(() => captureLocalVerification({
      root, run, env: poisonedEnv, now: TIME
    }), /Unrecognized commit hash/);
  }

  assert.equal(calls.some(x => x.command === 'forge' || x.command === 'bash'), false);
});

test('unexpected Git hash and malformed dates are rejected before Forge runs', t => {
  const root = fixture(t);
  const { run } = mockedCommands(root);
  assert.throws(() => captureLocalVerification({ root, run, now: new Date('invalid') }), /Invalid local evidence context/);
  const badHash = (cmd, args, opts) => {
    if (cmd === 'git' && args.join(' ') === 'rev-parse HEAD') return { status: 0, stdout: 'HEAD' };
    return run(cmd, args, opts);
  };
  assert.throws(() => captureLocalVerification({ root, run: badHash, env: poisonedEnv, now: TIME }), /Unrecognized commit hash/);
});

test('changes to inputs during the verification invalidate an otherwise green result', t => {
  const root = fixture(t);
  const { run: regular } = mockedCommands(root);
  const run = (command, args, options) => {
    const result = regular(command, args, options);
    if (command === 'bash') writeFileSync(join(root, 'foundry.toml'), 'MUTATED\n');
    return result;
  };
  const { record } = captureLocalVerification({ root, run, env: poisonedEnv, now: TIME });
  assert.equal(record.verifierExitCode, 0);
  assert.equal(record.inputsStableAfterRun, false);
  assert.equal(record.verificationStatus, 'INVALIDATED');
  assert.equal(record.releaseAuthorized, false);
});

test('exclusive write prevents replacing an existing evidence receipt', t => {
  const root = fixture(t);
  const { run } = mockedCommands(root);
  captureLocalVerification({ root, run, env: poisonedEnv, now: TIME });
  assert.throws(() => captureLocalVerification({ root, run, env: poisonedEnv, now: TIME }), /EEXIST/);
});

test('symlinked local evidence directory is refused', t => {
  const root = fixture(t);
  const external = mkdtempSync(join(tmpdir(), 'spica-other-'));
  t.after(() => rmSync(external, { recursive: true, force: true }));
  try {
    symlinkSync(external, join(root, '.spica-evidence'), 'dir');
  } catch (error) {
    if (['EPERM', 'ENOTSUP'].includes(error.code)) { t.skip('Symlinks unavailable'); return; }
    throw error;
  }
  const { run } = mockedCommands(root);
  assert.throws(() => captureLocalVerification({ root, run, env: poisonedEnv, now: TIME }), /real directory/);
  assert.deepEqual(readFileSync(join(root, 'foundry.toml'), 'utf8'),
    'synthetic fixture: foundry.toml\n');
});

test('standalone unsafe env names are rejected in any capitalization', () => {
  const mixed = {
    PATH: '/trusted/bin', HOME: '/home/example', TEMP: '/tmp',
    BaSh_EnV: '/tmp/startup',
    bashopts: 'extdebug',
    eNv: '/tmp/other-startup',
    cDpAtH: '/tmp/override',
    eth_rpc_url: 'https://example.invalid/private',
    ArBiTrUm_SePoLiA_rPc_Url: 'https://example.invalid/private',
    spica_confirm_testnet_deploy: 'YES_ARBITRUM_SEPOLIA_ONLY',
    gIt_wOrK_tReE: '/tmp/other-checkout',
    nPm_cOnFiG_sCrIpT_sHeLl: '/tmp/hostile-sh',
    dApP_fFi: 'true',
    FoUnDrY_pRoFiLe: 'unreviewed'
  };
  const sanitized = cleanVerificationEnv(mixed);
  assert.equal(sanitized.PATH, mixed.PATH);
  assert.equal(sanitized.HOME, mixed.HOME);
  assert.equal(sanitized.TEMP, mixed.TEMP);
  assert.equal(sanitized.NO_COLOR, '1');
  for (const key of Object.keys(mixed).slice(3)) {
    assert.equal(sanitized[key], undefined, 'unsafe case-variant survived: ' + key);
  }
});

test('child env uses a null-prototype record to avoid inherited setters', () => {
  const untrusted = Object.create(null);
  untrusted.PATH = '/trusted/bin';
  Object.defineProperty(untrusted, '__proto__', {
    value: { injected: true }, enumerable: true, configurable: true
  });
  const sanitized = cleanVerificationEnv(untrusted);
  assert.equal(Object.getPrototypeOf(sanitized), null);
  assert.equal(sanitized.injected, undefined);
  assert.equal(sanitized.PATH, '/trusted/bin');
});


test('real Git rejects hidden assume-unchanged input edits that porcelain status misses', t => {
  const root = fixture(t);
  writeFileSync(join(root, '.gitignore'), '.spica-evidence/\n');
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Spica test',
    '-c', 'user.email=spica@test.invalid', 'commit', '-qm', 'initial fixture']);
  // Real Git children need an actual executable search path. Keep hostile
  // overrides in the fixture while preserving only this trusted PATH value.
  const realGitEnv = { ...poisonedEnv, PATH: process.env.PATH };
  const calls = [];
  const run = (command, args, options) => {
    calls.push(command);
    if (command === 'git') return spawnSync(command, args, options);
    if (command === 'forge') return { status: 0, stdout: 'forge Version: 1.2.3\n' };
    if (command === 'bash') return { status: 0 };
    throw new Error('Unexpected command');
  };

  // Baseline: actual Git object IDs match, so the mocked verifier can report
  // local PASS (this says nothing about Solidity execution).
  const first = captureLocalVerification({
    root, run, env: realGitEnv, now: TIME
  });
  assert.equal(first.record.verificationStatus, 'PASS');
  assert.equal(first.record.releaseAuthorized, false);
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain=v1'],
    { encoding: 'utf8' }).trim(), '');

  const relative = 'foundry.toml';
  execFileSync('git', ['-C', root, 'update-index', '--assume-unchanged', relative]);
  writeFileSync(join(root, relative), 'changed despite assume-unchanged\n');
  // This is the Git blind spot: clean porcelain does NOT imply unchanged bytes.
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain=v1'],
    { encoding: 'utf8' }).trim(), '');

  const forgeBefore = calls.filter(x => x === 'forge').length;
  assert.throws(() => captureLocalVerification({
    root, run, env: realGitEnv,
    now: new Date('2026-11-14T12:35:10Z')
  }), /Critical working files differ from committed Git blobs/);
  assert.equal(calls.filter(x => x === 'forge').length, forgeBefore);
  assert.equal(readFileSync(first.outputPath, 'utf8').includes('"releaseAuthorized": false'), true);
});

test('mocked Git object mismatches fail before querying Forge', t => {
  const root = fixture(t);
  const { run: baseline, calls } = mockedCommands(root);
  const run = (cmd, args, options) => {
    if (cmd === 'git' && args[0] === 'hash-object') {
      calls.push({ command: cmd, args, options });
      return { status: 0, stdout: 'b'.repeat(40) };
    }
    return baseline(cmd, args, options);
  };
  assert.throws(() => captureLocalVerification({ root, run, env: poisonedEnv, now: TIME }),
    /Critical working files differ/);
  assert.equal(calls.some(x => x.command === 'forge' || x.command === 'bash'), false);
});


test('mocked HEAD drift invalidates a zero-exit verification with unchanged inputs', t => {
  const root = fixture(t);
  const { run: normal, calls } = mockedCommands(root);
  let headReads = 0;
  const run = (command, args, options) => {
    if (command === 'git' && args.join(' ') === 'rev-parse HEAD') {
      headReads++;
      if (headReads === 2) {
        calls.push({ command, args, options });
        return { status: 0, stdout: 'b'.repeat(40) };
      }
    }
    return normal(command, args, options);
  };
  const { record } = captureLocalVerification({ root, run, env: poisonedEnv, now: TIME });
  assert.equal(headReads, 2);
  assert.equal(record.gitCommit, SHA);
  assert.equal(record.verifierExitCode, 0);
  assert.equal(record.inputsStableAfterRun, false);
  assert.equal(record.verificationStatus, 'INVALIDATED');
  assert.equal(record.releaseAuthorized, false);
  assert.equal(calls.filter(x => x.command === 'bash').length, 1);
});

test('mocked HEAD drift invalidates a failed verification as well', t => {
  const root = fixture(t);
  const { run: normal, calls } = mockedCommands(root, { gate: 23 });
  let headReads = 0;
  const run = (command, args, options) => {
    if (command === 'git' && args.join(' ') === 'rev-parse HEAD') {
      headReads++;
      if (headReads === 2) {
        calls.push({ command, args, options });
        return { status: 0, stdout: 'e'.repeat(40) };
      }
    }
    return normal(command, args, options);
  };
  const { record } = captureLocalVerification({ root, run, env: poisonedEnv, now: TIME });
  assert.equal(headReads, 2);
  assert.equal(record.gitCommit, SHA);
  assert.equal(record.verifierExitCode, 23);
  assert.equal(record.inputsStableAfterRun, false);
  assert.equal(record.verificationStatus, 'INVALIDATED');
  assert.equal(record.releaseAuthorized, false);
  assert.equal(calls.filter(x => x.command === 'bash').length, 1);
});

test('real Git commit change with unchanged contract inputs cannot yield PASS', t => {
  const root = fixture(t);
  writeFileSync(join(root, '.gitignore'), '.spica-evidence/\n');
  writeFileSync(join(root, 'README.md'), 'initial research notes\n');
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Spica test',
    '-c', 'user.email=spica@test.invalid', 'commit', '-qm', 'initial fixture']);
  const firstHead = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'],
    { encoding: 'utf8' }).trim();
  // Keep real Git discoverable while testing all other environment filters.
  const realGitEnv = { ...poisonedEnv, PATH: process.env.PATH };
  let verifierCalls = 0;
  const run = (command, args, options) => {
    if (command === 'git') return spawnSync(command, args, options);
    if (command === 'forge') return { status: 0, stdout: 'forge Version: 1.2.3\n' };
    if (command === 'bash') {
      verifierCalls++;
      // Deliberately move HEAD to a different *clean* commit while retaining
      // every critical Solidity/config/verifier blob unchanged.
      writeFileSync(join(root, 'README.md'), 'revised research notes\n');
      execFileSync('git', ['-C', root, 'add', 'README.md']);
      execFileSync('git', ['-C', root, '-c', 'user.name=Spica test',
        '-c', 'user.email=spica@test.invalid', 'commit', '-qm', 'noncritical docs']);
      return { status: 0 };
    }
    throw new Error('Unexpected command');
  };
  const { record } = captureLocalVerification({ root, run, env: realGitEnv, now: TIME });
  const lastHead = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'],
    { encoding: 'utf8' }).trim();
  assert.notEqual(lastHead, firstHead);
  assert.equal(record.gitCommit, firstHead);
  assert.equal(verifierCalls, 1);
  assert.equal(record.verifierExitCode, 0);
  assert.equal(record.inputsStableAfterRun, false);
  assert.equal(record.verificationStatus, 'INVALIDATED');
  assert.equal(record.releaseAuthorized, false);
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain=v1'],
    { encoding: 'utf8' }).trim(), '');
});


test('real SHA-256 Git repositories produce valid local receipts', t => {
  const root = fixture(t);
  writeFileSync(join(root, '.gitignore'), '.spica-evidence/\n');
  const initialized = spawnSync('git',
    ['init', '-q', '--object-format=sha256', root], { encoding: 'utf8' });
  if (initialized.status !== 0) {
    if (/unknown option|unknown object format|unsupported.*sha.?256/i.test(initialized.stderr || '')) {
      t.skip('Installed Git does not support SHA-256 repositories');
      return;
    }
    throw new Error('Unable to initialize SHA-256 Git fixture');
  }
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Spica test',
    '-c', 'user.email=spica@test.invalid', 'commit', '-qm', 'SHA-256 fixture']);
  const expectedCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'],
    { encoding: 'utf8' }).trim();
  assert.match(expectedCommit, /^[0-9a-f]{64}$/);

  const realGitEnv = { ...poisonedEnv, PATH: process.env.PATH };
  const run = (command, args, options) => {
    if (command === 'git') return spawnSync(command, args, options);
    if (command === 'forge') return { status: 0, stdout: 'forge Version: 1.2.3\n' };
    if (command === 'bash') return { status: 0 };
    throw new Error('Unexpected command');
  };
  const { record } = captureLocalVerification({
    root, run, env: realGitEnv, now: TIME
  });
  assert.equal(record.gitCommit, expectedCommit);
  assert.equal(record.gitCommit.length, 64);
  assert.equal(record.verificationStatus, 'PASS');
  assert.equal(record.releaseAuthorized, false);
});
