#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Read-only, fail-closed preflight for the reviewed local Foundry profile.
// Never launches Forge, a wallet, a signer or an RPC connection.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSmallBytes } from './read-small-file.mjs';

const expected = Object.freeze({
  'profile.default': Object.freeze({
    src: '"src"',
    test: '"test"',
    out: '"out"',
    libs: '["node_modules"]',
    solc_version: '"0.8.24"',
    optimizer: 'true',
    optimizer_runs: '200',
    evm_version: '"shanghai"',
    remappings: '["@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/"]'
  }),
  'profile.default.fuzz': Object.freeze({
    runs: '256'
  }),
  'profile.default.invariant': Object.freeze({
    runs: '64',
    depth: '64',
    fail_on_revert: 'true',
    show_metrics: 'true'
  })
});

export function checkFoundryConfig(source) {
  if (typeof source !== 'string' || source.length === 0 || source.length > 16_384) {
    return { valid: false, errors: ['Foundry config missing or larger than 16 KiB'] };
  }
  const errors = [];
  const seenSections = new Set();
  const seenKeys = new Map();
  let section = '';
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  for (const [index, original] of lines.entries()) {
    const line = original.trim();
    if (!line || line.startsWith('#')) continue;
    const header = /^\[([a-z0-9_.-]+)\]$/.exec(line);
    if (header) {
      section = header[1];
      if (!Object.hasOwn(expected, section)) {
        errors.push('unexpected Foundry section at line ' + (index + 1));
      }
      if (seenSections.has(section)) {
        errors.push('duplicate Foundry section at line ' + (index + 1));
      }
      seenSections.add(section);
      if (!seenKeys.has(section)) seenKeys.set(section, new Set());
      continue;
    }
    const assignment = /^([a-z_]+)\s*=\s*(\S(?:.*\S)?)$/.exec(line);
    if (!assignment || !Object.hasOwn(expected, section)) {
      errors.push('unrecognized Foundry setting at line ' + (index + 1));
      continue;
    }
    const [, key, value] = assignment;
    const keys = seenKeys.get(section);
    if (!Object.hasOwn(expected[section], key)) {
      errors.push('unapproved Foundry key at line ' + (index + 1));
      continue;
    }
    if (keys.has(key)) {
      errors.push('duplicate Foundry key at line ' + (index + 1));
      continue;
    }
    keys.add(key);
    if (value !== expected[section][key]) {
      errors.push('changed Foundry setting ' + section + '.' + key);
    }
  }
  for (const [name, required] of Object.entries(expected)) {
    if (!seenSections.has(name)) {
      errors.push('missing Foundry section ' + name);
      continue;
    }
    for (const key of Object.keys(required)) {
      if (!seenKeys.get(name)?.has(key)) errors.push('missing Foundry setting ' + name + '.' + key);
    }
  }
  return { valid: errors.length === 0, errors };
}

function main() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const bytes = readSmallBytes(join(root, 'foundry.toml'));
    if (bytes.length > 16_384) throw new Error('config exceeds reviewed size limit');
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const result = checkFoundryConfig(source);
    if (!result.valid) {
      for (const reason of result.errors) console.error('FAIL: ' + reason);
      process.exitCode = 1;
      return;
    }
    console.log('PASS: reviewed offline Foundry profile (Solidity 0.8.24; fuzz 256; invariant 64×64; no RPC or extra sections).');
    console.log('NOTE: this checks configuration text, not an installed compiler, Forge execution, test results or an audit.');
  } catch {
    console.error('FAIL: cannot safely read the reviewed Foundry configuration.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
