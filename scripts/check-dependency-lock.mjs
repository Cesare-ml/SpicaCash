#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Check the review-approved OpenZeppelin version and published npm tarball SRI.
// This checks metadata only; use `npm ci` to check downloaded bytes on install.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pinnedName = '@openzeppelin/contracts';
const pinnedVersion = '5.4.0';
const pinnedTarball = 'https://registry.npmjs.org/@openzeppelin/contracts/-/contracts-5.4.0.tgz';
const pinnedIntegrity = 'sha512-eCYgWnLg6WO+X52I16TZt8uEjbtdkgLC0SUX/xnAksjjrQI4Xfn4iBRoI5j55dmlOhDv1Y7BoR3cU7e3WWhC6A==';
const own = (value, property) => Object.hasOwn(value, property);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// A lock digest alone does not protect npm's executable lifecycle hooks or
// package.json scripts. Changes to the reviewed commands need explicit review.
const reviewedScripts = Object.freeze({
  "build": "forge build && node scripts/check-abi.mjs",
  "check:abi": "node scripts/check-abi.mjs",
  "test": "forge test -vv",
  "test:fuzz": "forge test --match-test testFuzz -vv",
  "test:invariant": "forge test --match-test invariant_ -vv",
  "test:abi-guard": "node --test test/node/abi-check.test.mjs",
  "test:deploy-guard": "bash test/shell/deploy-guard.test.sh",
  "test:offline": "npm run test:dependency-lock && npm run test:abi-guard && npm run test:deploy-guard && npm run test:rpc-url && npm run test:rpc-deploy-guard && npm run test:foundry-evidence && npm run test:local-gate && npm run test:foundry-format && npm run test:bootstrap",
  "test:rpc-url": "node --test test/node/rpc-url.test.mjs",
  "test:rpc-deploy-guard": "bash test/shell/rpc-url-guard.test.sh",
  "test:foundry-evidence": "node --test test/node/foundry-evidence.test.mjs",
  "check:foundry-invariants": "node scripts/check-foundry-invariants.mjs",
  "verify:local": "bash scripts/verify-local.sh",
  "test:local-gate": "bash test/shell/verify-local-guard.test.sh",
  "test:foundry-format": "node --test test/node/foundry-format.test.mjs",
  "test:dependency-lock": "node --test test/node/dependency-lock.test.mjs",
  "test:bootstrap": "bash test/shell/bootstrap-deps.test.sh"
});
const reviewedManifestFields = new Set([
  'name', 'version', 'private', 'description', 'scripts', 'dependencies', 'engines',
  'devDependencies', 'optionalDependencies', 'peerDependencies',
]);
const reviewedLockFields = new Set(['name', 'version', 'lockfileVersion', 'requires', 'packages']);
const reviewedRootFields = new Set(['name', 'version', 'dependencies', 'engines']);
const reviewedDependencyFields = new Set(['version', 'resolved', 'integrity', 'license']);
const unexpectedKeys = (object, reviewed) =>
  Object.keys(object).filter((key) => !reviewed.has(key));

export function checkDependencyLock(manifest, lock) {
  const errors = [];
  if (!record(manifest) || !record(lock)) {
    return { valid: false, errors: ['package manifest and lockfile must be JSON objects'] };
  }
  // npm ci can execute preinstall/install/postinstall/prepare and pre/post
  // hooks for npm run. Pin the exact commands so silent script changes fail.
  if (!record(manifest.scripts)) {
    errors.push('npm scripts must match the reviewed script commands');
  } else {
    const entries = Object.entries(reviewedScripts);
    if (Object.keys(manifest.scripts).length !== entries.length ||
        entries.some(([name, command]) => manifest.scripts[name] !== command)) {
      errors.push('npm scripts must match the reviewed script commands');
    }
  }
  if (unexpectedKeys(manifest, reviewedManifestFields).length !== 0 || manifest.private !== true) {
    errors.push('unexpected package.json fields or non-private package; require review');
  }
  if (unexpectedKeys(lock, reviewedLockFields).length !== 0) {
    errors.push('unexpected top-level lockfile metadata');
  }
  const deps = manifest.dependencies;
  if (!record(deps) || Object.keys(deps).length !== 1 || deps[pinnedName] !== pinnedVersion) {
    errors.push('manifest must pin only @openzeppelin/contracts@5.4.0');
  }
  for (const field of ['devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (own(manifest, field) && (!record(manifest[field]) || Object.keys(manifest[field]).length !== 0)) {
      errors.push(`unexpected manifest ${field}; require independent dependency review`);
    }
  }
  if (manifest.name !== 'spicacash-contracts' || manifest.version !== '0.0.1') {
    errors.push('unexpected project package identity');
  }
  if (lock.lockfileVersion !== 3 || lock.requires !== true) {
    errors.push('npm lockfile must use v3 and requires=true');
  }
  if (lock.name !== manifest.name || lock.version !== manifest.version) {
    errors.push('lockfile project identity differs from manifest');
  }
  const packages = lock.packages;
  if (!record(packages) || Object.keys(packages).length !== 2 ||
      !own(packages, '') || !own(packages, `node_modules/${pinnedName}`)) {
    errors.push('lockfile must contain exactly root and pinned OpenZeppelin package');
    return { valid: false, errors };
  }
  const project = packages[''];
  if (!record(project) || project.name !== manifest.name || project.version !== manifest.version ||
      !record(project.dependencies) || Object.keys(project.dependencies).length !== 1 ||
      project.dependencies[pinnedName] !== pinnedVersion) {
    errors.push('lockfile root dependencies or identity are inconsistent');
  }
  if (record(project) && unexpectedKeys(project, reviewedRootFields).length !== 0) {
    errors.push('unreviewed root package metadata in lockfile');
  }
  if (!record(project?.engines) || project.engines.node !== '>=20') {
    errors.push('unexpected Node engine requirement in root lock entry');
  }
  const dependency = packages[`node_modules/${pinnedName}`];
  if (!record(dependency) || dependency.version !== pinnedVersion ||
      dependency.resolved !== pinnedTarball || dependency.integrity !== pinnedIntegrity ||
      dependency.license !== 'MIT') {
    errors.push('OpenZeppelin version, registry, license or SHA-512 integrity differs from pinned release');
  }
  if (record(dependency) && unexpectedKeys(dependency, reviewedDependencyFields).length !== 0) {
    errors.push('unreviewed dependency metadata in lockfile');
  }
  if (own(lock, 'dependencies')) {
    errors.push('lockfile contains unexpected legacy dependency records');
  }
  return { valid: errors.length === 0, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.length !== 2) {
    console.error('Usage: node scripts/check-dependency-lock.mjs');
    process.exitCode = 2;
  } else {
    try {
      const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
      const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
      const { valid, errors } = checkDependencyLock(manifest, lock);
      if (readFileSync(resolve(root, '.npmrc'), 'utf8') !== 'ignore-scripts=true\n') {
        errors.push('project .npmrc must set ignore-scripts=true');
      }
      if (!valid || errors.length !== 0) {
        for (const error of errors) console.error(`Dependency lock check failed: ${error}`);
        process.exitCode = 1;
      } else {
        console.log('PASS: @openzeppelin/contracts@5.4.0 pinned with reviewed npm SHA-512 integrity');
      }
    } catch {
      // Avoid printing local paths/environment details.
      console.error('Dependency lock check failed: cannot read or parse dependency policy inputs');
      process.exitCode = 1;
    }
  }
}
