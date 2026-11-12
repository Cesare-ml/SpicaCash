#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Enforce review if SpicaCash's compiled public interface changes.
// Run after `forge build`: node scripts/check-abi.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactPath = resolve(process.argv[2] || 'out/SpicaCash.sol/SpicaCash.json');
const fail = (message) => {
  console.error(`SpicaCash ABI safety check failed: ${message}`);
  process.exit(1);
};

let artifact;
try {
  artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
} catch (error) {
  fail(`cannot read ${artifactPath}: ${error.message}`);
}

if (!Array.isArray(artifact.abi)) fail('artifact must contain an ABI array');

const expectedFunctions = new Map([
  ['allowance(address,address)', 'view'],
  ['approve(address,uint256)', 'nonpayable'],
  ['balanceOf(address)', 'view'],
  ['decimals()', 'view'],
  ['name()', 'view'],
  ['symbol()', 'view'],
  ['totalSupply()', 'view'],
  ['transfer(address,uint256)', 'nonpayable'],
  ['transferFrom(address,address,uint256)', 'nonpayable'],
]);

const signature = (item) =>
  `${item.name}(${(item.inputs || []).map((input) => input.type).join(',')})`;

const seen = new Set();
for (const item of artifact.abi) {
  if (item.type === 'fallback' || item.type === 'receive') {
    fail(`unexpected ${item.type} entry`);
  }
  if (item.type !== 'function') continue;
  const name = signature(item);
  if (!expectedFunctions.has(name)) fail(`unexpected callable function: ${name}`);
  if (seen.has(name)) fail(`duplicate callable function: ${name}`);
  if (item.stateMutability !== expectedFunctions.get(name)) {
    fail(`unexpected mutability for ${name}: ${item.stateMutability}`);
  }
  seen.add(name);
}

for (const name of expectedFunctions.keys()) {
  if (!seen.has(name)) fail(`missing standard ERC-20 function: ${name}`);
}

const constructors = artifact.abi.filter((item) => item.type === 'constructor');
if (constructors.length !== 1) fail('expected exactly one constructor');
if (constructors[0].stateMutability !== 'nonpayable') {
  fail('constructor must be nonpayable');
}
if ((constructors[0].inputs || []).map((input) => input.type).join(',') !== 'address,uint256') {
  fail('constructor must take initialHolder and initialSupplyBaseUnits');
}

console.log(`PASS: SpicaCash ABI has ${seen.size} expected ERC-20 functions and no extra callable methods`);
