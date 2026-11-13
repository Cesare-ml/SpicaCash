// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkDependencyLock } from '../../scripts/check-dependency-lock.mjs';

const project = resolve(import.meta.dirname, '../..');
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
