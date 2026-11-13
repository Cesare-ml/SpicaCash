// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { checkDependencyLock } from '../../scripts/check-dependency-lock.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(resolve(project, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(resolve(project, 'package-lock.json'), 'utf8'));
const inputs = () => [structuredClone(manifest), structuredClone(lock)];
const rejects = (name, mutate, message) => test(name, () => {
  const [pkg, locked] = inputs();
  mutate(pkg, locked);
  const result = checkDependencyLock(pkg, locked);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), message);
});

test('pinned OpenZeppelin v5.4.0 manifest and SRI lock are consistent', () => {
  assert.deepEqual(checkDependencyLock(...inputs()), { valid: true, errors: [] });
});
rejects('reject edited dependency version in package.json', (p) => { p.dependencies['@openzeppelin/contracts'] = '^5.4.0'; }, /pin only/);
rejects('reject extra runtime dependency', (p) => { p.dependencies['extra-package'] = '1.2.3'; }, /pin only/);
rejects('reject unexpected dev dependency', (p) => { p.devDependencies = { hardhat: '*' }; }, /unexpected manifest devDependencies/);
rejects('reject missing dependency manifest', (p) => { delete p.dependencies; }, /pin only/);
rejects('reject malformed optional dependency list', (p) => { p.optionalDependencies = null; }, /optionalDependencies/);
rejects('reject unexpected root version', (p) => { p.version = '1.0.0'; }, /project package identity/);
rejects('reject lockfile version downgrade', (_p, l) => { l.lockfileVersion = 2; }, /lockfile must use v3/);
rejects('reject lockfile missing required packages', (_p, l) => { delete l.packages['node_modules/@openzeppelin/contracts']; }, /exactly root/);
rejects('reject any additional locked package', (_p, l) => { l.packages['node_modules/random'] = {}; }, /exactly root/);
rejects('reject lockfile root version mismatch', (_p, l) => { l.packages[''].version = '1.0.0'; }, /root dependencies or identity/);
rejects('reject lockfile root dependency mismatch', (_p, l) => { l.packages[''].dependencies['@openzeppelin/contracts'] = '5.5.0'; }, /root dependencies or identity/);
rejects('reject lockfile OpenZeppelin version mismatch', (_p, l) => { l.packages['node_modules/@openzeppelin/contracts'].version = '5.5.0'; }, /SHA-512 integrity/);
rejects('reject changed package tarball destination', (_p, l) => { l.packages['node_modules/@openzeppelin/contracts'].resolved = 'https://other.example/contracts.tgz'; }, /SHA-512 integrity/);
rejects('reject changed tarball digest', (_p, l) => { l.packages['node_modules/@openzeppelin/contracts'].integrity = 'sha512-fake'; }, /SHA-512 integrity/);
rejects('reject missing SHA-512 digest', (_p, l) => { delete l.packages['node_modules/@openzeppelin/contracts'].integrity; }, /SHA-512 integrity/);
rejects('reject legacy dependency entries', (_p, l) => { l.dependencies = { random: '1.0.0' }; }, /legacy dependency/);
rejects('reject corrupt lockfile structure', (_p, l) => { l.packages = []; }, /exactly root/);
test('CLI checks current repository lock successfully', () => {
  const run = spawnSync(process.execPath, [resolve(project, 'scripts/check-dependency-lock.mjs')], { encoding: 'utf8', cwd: '/tmp' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /PASS: @openzeppelin\/contracts@5\.4\.0/);
});

// npm lifecycle hooks execute during ordinary `npm ci` unless ignore-scripts is
// set. Lockfile integrity alone does not make those commands safe.
rejects('reject added npm preinstall lifecycle hook', (p) => { p.scripts.preinstall = 'echo unsafe'; }, /npm scripts must match/);
rejects('reject added npm postinstall lifecycle hook', (p) => { p.scripts.postinstall = 'echo unsafe'; }, /npm scripts must match/);
rejects('reject added npm prepare lifecycle hook', (p) => { p.scripts.prepare = 'echo unsafe'; }, /npm scripts must match/);
rejects('reject added pretest:offline hook that runs before checks', (p) => { p.scripts['pretest:offline'] = 'echo unsafe'; }, /npm scripts must match/);
rejects('reject altered offline test command', (p) => { p.scripts['test:offline'] = 'echo skipped'; }, /npm scripts must match/);
rejects('reject altered Solidity verifier command', (p) => { p.scripts['verify:local'] = 'echo skipped'; }, /npm scripts must match/);
rejects('reject removal of dependency checker command', (p) => { delete p.scripts['test:dependency-lock']; }, /npm scripts must match/);
rejects('reject npm overrides metadata', (p) => { p.overrides = {'@openzeppelin/contracts': '0.1.0'}; }, /unexpected package.json fields/);
rejects('reject workspace package injection', (p) => { p.workspaces = ['packages/*']; }, /unexpected package.json fields/);
rejects('reject bundledDependencies metadata', (p) => { p.bundledDependencies = ['other']; }, /unexpected package.json fields/);
rejects('reject package made public', (p) => { p.private = false; }, /non-private package/);
rejects('reject unexpected top-level lock metadata', (_p, l) => { l.overrides = {other: '1.0.0'}; }, /unexpected top-level lockfile metadata/);
rejects('reject root install hook indicator', (_p, l) => { l.packages[''].hasInstallScript = true; }, /unreviewed root package metadata/);
rejects('reject dependency install hook indicator', (_p, l) => { l.packages['node_modules/@openzeppelin/contracts'].hasInstallScript = true; }, /unreviewed dependency metadata/);
rejects('reject dependency binary entry', (_p, l) => { l.packages['node_modules/@openzeppelin/contracts'].bin = {hack: 'run.js'}; }, /unreviewed dependency metadata/);

test('npm ci --ignore-scripts suppresses local preinstall hook (offline empty fixture)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spicacash-npm-policy-'));
  const marker = join(dir, 'unexpected-preinstall-run');
  try {
    // The only script would write a harmless marker; no dependencies or network.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name:'offline-lifecycle-fixture', version:'0.0.1', private:true,
      scripts: {preinstall: 'node -e "require(\'fs\').writeFileSync(\'unexpected-preinstall-run\',\'executed\')"'}
    }));
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
      name:'offline-lifecycle-fixture', version:'0.0.1', lockfileVersion:3, requires:true,
      packages: {'': {name:'offline-lifecycle-fixture', version:'0.0.1'}}
    }));
    const cli = spawnSync('npm', ['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], {
      encoding:'utf8', cwd:dir, timeout:15000
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(existsSync(marker), false, 'npm ci executed a lifecycle hook despite --ignore-scripts');
  } finally { rmSync(dir, {recursive:true, force:true}); }
});

test('repository npm policy disables install scripts by default', () => {
  assert.equal(readFileSync(resolve(project, '.npmrc'), 'utf8'), 'ignore-scripts=true\n');
});

test('npm ci respects project .npmrc ignore-scripts default (offline fixture)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spicacash-npm-config-'));
  const marker = join(dir, 'unexpected-preinstall-run');
  try {
    writeFileSync(join(dir, '.npmrc'), 'ignore-scripts=true\n');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name:'offline-npmrc-fixture', version:'0.0.1', private:true,
      scripts: {preinstall: 'node -e "require(\'fs\').writeFileSync(\'unexpected-preinstall-run\',\'executed\')"'}
    }));
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
      name:'offline-npmrc-fixture', version:'0.0.1', lockfileVersion:3, requires:true,
      packages: {'': {name:'offline-npmrc-fixture', version:'0.0.1'}}
    }));
    const env = {...process.env};
    delete env.npm_config_ignore_scripts;
    delete env.NPM_CONFIG_IGNORE_SCRIPTS;
    const result = spawnSync('npm', ['ci', '--offline', '--no-audit', '--no-fund'], {
      encoding:'utf8', cwd:dir, env, timeout:15000
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(marker), false, 'npm ci ignored the project .npmrc policy');
  } finally { rmSync(dir, {recursive:true, force:true}); }
});

test('dependency lock CLI rejects tampered project npm configuration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spicacash-lock-policy-'));
  const scriptsDir = join(dir, 'scripts');
  try {
    mkdirSync(scriptsDir, {recursive:true});
    copyFileSync(resolve(project,'scripts/check-dependency-lock.mjs'), join(scriptsDir,'check-dependency-lock.mjs'));
    copyFileSync(resolve(project,'package.json'), join(dir,'package.json'));
    copyFileSync(resolve(project,'package-lock.json'), join(dir,'package-lock.json'));
    writeFileSync(join(dir,'.npmrc'), 'ignore-scripts=false\n');
    const result = spawnSync(process.execPath, [join(scriptsDir,'check-dependency-lock.mjs')], {cwd:dir,encoding:'utf8'});
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /project .npmrc must set ignore-scripts=true/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
