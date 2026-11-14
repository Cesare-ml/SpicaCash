// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, copyFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureEvidence, childEnvironment, digestRegularFile } from '../../scripts/capture-offline-evidence.mjs';

const source = fileURLToPath(new URL('../../scripts/capture-offline-evidence.mjs', import.meta.url));
const testSource = fileURLToPath(import.meta.url);
const filenames = ['.npmrc', 'package.json', 'package-lock.json'];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'spica-evidence-'));
  mkdirSync(join(dir, 'scripts'));
  mkdirSync(join(dir, 'test', 'node'), { recursive: true });
  copyFileSync(testSource, join(dir, 'test', 'node', 'offline-evidence.test.mjs'));
  copyFileSync(source, join(dir, 'scripts', 'capture-offline-evidence.mjs'));
  for (const file of filenames) writeFileSync(join(dir, file), file + '\n');
  writeFileSync(join(dir, 'scripts', 'check-dependency-lock.mjs'), "console.log('policy OK');\n");
  writeFileSync(join(dir, 'scripts', 'run-offline-node.mjs'), "console.log('suite OK');\n");
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, '-c', 'user.name=Spica Test', '-c', 'user.email=spica@test.invalid', 'add', '.']);
  execFileSync('git', ['-C', dir, '-c', 'user.name=Spica Test', '-c', 'user.email=spica@test.invalid', 'commit', '-qm', 'fixture']);
  return dir;
}
const cleanup = dir => rmSync(dir, { recursive: true, force: true });
const cli = dir => spawnSync(process.execPath, [join(dir, 'scripts', 'capture-offline-evidence.mjs')], { cwd: dir, encoding: 'utf8' });

test('captures real clean Git provenance, source hashes and both child command outputs', () => {
  const dir = fixture();
  try {
    const result = cli(dir);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'PASSED_NODE_ONLY');
    assert.equal(report.releaseStatus, 'NOT_AUTHORIZED');
    assert.equal(report.authorization, 'NONE');
    assert.match(report.source.commitSha, /^[a-f0-9]{40}$/u);
    assert.equal(report.source.clean, true);
    assert.equal(Object.keys(report.source.sha256).length, 7);
    assert.match(report.source.sha256['scripts/capture-offline-evidence.mjs'], /^[a-f0-9]{64}$/u);
    assert.match(report.source.sha256['test/node/offline-evidence.test.mjs'], /^[a-f0-9]{64}$/u);
    assert.deepEqual(report.checks.map(x => x.id), ['DEPENDENCY_POLICY', 'OFFLINE_NODE']);
    assert.match(report.checks[0].stdout, /policy OK/u);
    assert.match(report.checks[1].stdout, /suite OK/u);
  } finally { cleanup(dir); }
});

test('refuses dirty working trees before executing any test script', () => {
  const dir = fixture();
  try {
    appendFileSync(join(dir, 'package.json'), 'dirty');
    const result = cli(dir);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'INCOMPLETE');
    assert.equal(report.source.clean, false);
    assert.equal(report.checks.length, 0);
  } finally { cleanup(dir); }
});

test('stops after dependency preflight failure; never falsely reports verified', () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, 'scripts', 'check-dependency-lock.mjs'), "console.error('rejected');process.exitCode=1;\n");
    execFileSync('git', ['-C', dir, 'add', '.']);
    execFileSync('git', ['-C', dir, '-c', 'user.name=Spica Test', '-c', 'user.email=spica@test.invalid', 'commit', '-qm', 'failing policy']);
    const result = cli(dir);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'FAILED');
    assert.equal(report.checks.length, 1);
    assert.equal(report.checks[0].exitCode, 1);
    assert.match(report.checks[0].stderr, /rejected/u);
  } finally { cleanup(dir); }
});

test('inherits no NODE_OPTIONS or npm node-options in spawned checks', () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, 'scripts', 'run-offline-node.mjs'), "console.log('NODE_OPTIONS=' + process.env.NODE_OPTIONS + ';NPM=' + process.env.npm_config_node_options);\n");
    execFileSync('git', ['-C', dir, 'add', '.']);
    execFileSync('git', ['-C', dir, '-c', 'user.name=Spica Test', '-c', 'user.email=spica@test.invalid', 'commit', '-qm', 'probe env']);
    // Only the child process is sanitized. The initial launcher itself must be trusted.
    const report = captureEvidence(dir);
    assert.equal(report.status, 'PASSED_NODE_ONLY');
    assert.match(report.checks[1].stdout, /NODE_OPTIONS=;NPM=\s*/u);
    assert.equal(childEnvironment({ NODE_OPTIONS: '--import=evil', npm_config_node_options: '--require=evil' }).NODE_OPTIONS, '');
  } finally { cleanup(dir); }
});

test('rejects symlink input files and refuses to run verification', (t) => {
  const dir = fixture();
  try {
    const link = join(dir, 'package-lock.json');
    rmSync(link);
    try {
      symlinkSync(join(dir, 'package.json'), link);
    } catch (error) {
      // Unprivileged Windows Git/Node environments may deny symlink creation.
      if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error?.code)) {
        t.skip('Windows file symlink privilege unavailable');
        return;
      }
      throw error;
    }
    assert.throws(() => digestRegularFile(link), /regular file/u);
    const report = captureEvidence(dir);
    assert.equal(report.status, 'INCOMPLETE');
    assert.equal(report.checks.length, 0);
  } finally { cleanup(dir); }
});

test('refuses unsupported arguments instead of ignoring verification settings', () => {
  const dir = fixture();
  try {
    const result = spawnSync(process.execPath, [join(dir, 'scripts', 'capture-offline-evidence.mjs'), '--skip-checks'], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage:/u);
  } finally { cleanup(dir); }
});


test('fails when a check mutates the checkout after initial provenance check', () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, 'scripts', 'run-offline-node.mjs'),
      "import { appendFileSync } from 'node:fs'; appendFileSync('package.json', 'changed');\n");
    execFileSync('git', ['-C', dir, 'add', '.']);
    execFileSync('git', ['-C', dir, '-c', 'user.name=Spica Test', '-c', 'user.email=spica@test.invalid', 'commit', '-qm', 'mutating test']);
    const result = cli(dir);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'INCOMPLETE');
    assert.match(report.failure, /checkout changed/u);
    assert.equal(report.checks.length, 2);
  } finally { cleanup(dir); }
});

test('runner failures have distinct FAILED status, captured stderr and no authorization', () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, 'scripts', 'run-offline-node.mjs'), "console.error('suite rejected'); process.exitCode = 3;\n");
    execFileSync('git', ['-C', dir, 'add', '.']);
    execFileSync('git', ['-C', dir, '-c', 'user.name=Spica Test', '-c', 'user.email=spica@test.invalid', 'commit', '-qm', 'runner failure']);
    const result = cli(dir);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'FAILED');
    assert.equal(report.releaseStatus, 'NOT_AUTHORIZED');
    assert.equal(report.checks[1].exitCode, 3);
    assert.match(report.checks[1].stderr, /suite rejected/u);
  } finally { cleanup(dir); }
});

test('refuses a nested directory even if Git finds a clean parent repository', () => {
  const dir = fixture();
  try {
    const nested = join(dir, 'nested');
    mkdirSync(join(nested, 'scripts'), { recursive: true });
    mkdirSync(join(nested, 'test', 'node'), { recursive: true });
    for (const path of ['scripts/capture-offline-evidence.mjs',
      'test/node/offline-evidence.test.mjs', 'scripts/run-offline-node.mjs',
      'scripts/check-dependency-lock.mjs', ...filenames]) {
      const destination = join(nested, path);
      copyFileSync(join(dir, path), destination);
    }
    execFileSync('git', ['-C', dir, 'add', '.']);
    execFileSync('git', ['-C', dir, '-c', 'user.name=Spica Test',
      '-c', 'user.email=spica@test.invalid', 'commit', '-qm', 'nested files']);
    const report = captureEvidence(nested);
    assert.equal(report.status, 'INCOMPLETE');
    assert.match(report.failure, /Git worktree root/u);
    assert.equal(report.checks.length, 0);
  } finally { cleanup(dir); }
});

test('the reporter and its regression test file are included in source digests', () => {
  const dir = fixture();
  try {
    const report = captureEvidence(dir);
    assert.equal(report.status, 'PASSED_NODE_ONLY');
    assert.equal(report.source.sha256['scripts/capture-offline-evidence.mjs'],
      digestRegularFile(join(dir, 'scripts/capture-offline-evidence.mjs')));
    assert.equal(report.source.sha256['test/node/offline-evidence.test.mjs'],
      digestRegularFile(join(dir, 'test/node/offline-evidence.test.mjs')));
  } finally { cleanup(dir); }
});

test('child environment filters Git, shell startup, loader and case-variant overrides', () => {
  const hostile = {
    PATH: '/trusted/bin', HOME: '/home/test', TEMP: '/tmp/test', LANG: 'C',
    GIT_DIR: '/tmp/fake.git', Git_Work_Tree: '/tmp/other',
    git_config_count: '1', GIT_INDEX_FILE: '/tmp/fake.index',
    NPM_CONFIG_SCRIPT_SHELL: '/tmp/evil-sh', Node_Path: '/tmp/inject',
    'bAsH_FuNc_git%%': '() { exit 0; }', BASH_ENV: '/tmp/evil-bash',
    bAsHoPtS: 'extdebug', ENV: '/tmp/evil-env', CDPATH: '/tmp',
    DaPp_FfI: 'true', FOUNDRY_PROFILE: 'untrusted',
    LD_PRELOAD: '/tmp/evil.so', dYlD_insert_libraries: '/tmp/evil.dylib',
    eth_rpc_url: 'https://example.invalid/private', ARBITRUM_SEPOLIA_RPC_URL: 'secret',
    SPICA_CONFIRM_TESTNET_DEPLOY: 'YES_ARBITRUM_SEPOLIA_ONLY',
  };
  const clean = childEnvironment(hostile);
  for (const key of ['PATH', 'HOME', 'TEMP', 'LANG']) {
    assert.equal(clean[key], hostile[key]);
  }
  for (const key of Object.keys(hostile).slice(4)) {
    assert.equal(clean[key], key === 'NPM_CONFIG_SCRIPT_SHELL' ? '' : undefined,
      'unsafe override inherited: ' + key);
  }
  for (const key of ['NODE_OPTIONS', 'npm_config_node_options',
    'NPM_CONFIG_NODE_OPTIONS', 'npm_config_script_shell',
    'NPM_CONFIG_SCRIPT_SHELL']) {
    assert.equal(clean[key], '');
  }
});

test('real CLI uses clean checkout even with hostile inherited Git redirection', () => {
  const dir = fixture();
  try {
    const expected = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8'
    }).trim();
    const result = spawnSync(process.execPath,
      [join(dir, 'scripts', 'capture-offline-evidence.mjs')], {
        cwd: dir, encoding: 'utf8',
        env: {
          ...process.env,
          GIT_DIR: join(dir, 'absent-git-dir'),
          GIT_WORK_TREE: join(dir, 'wrong-work-tree'),
          GIT_INDEX_FILE: join(dir, 'bad-index-file'),
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: 'core.fsmonitor',
          GIT_CONFIG_VALUE_0: 'false',
        }
      });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'PASSED_NODE_ONLY');
    assert.equal(report.source.commitSha, expected);
    assert.equal(report.source.clean, true);
    assert.equal(report.releaseStatus, 'NOT_AUTHORIZED');
  } finally { cleanup(dir); }
});
