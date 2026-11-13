#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Reject unreviewed changes to the *compiled* SpicaCash public ABI.
// This does not audit bytecode, roles, storage, token balances or dependencies.
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

// Ethereum ERC-20 functions. Require their return types and mutability too,
// rather than merely matching the method names and input types.
const expectedFunctions = new Map([
  ['allowance(address,address)', ['view', 'uint256']],
  ['approve(address,uint256)', ['nonpayable', 'bool']],
  ['balanceOf(address)', ['view', 'uint256']],
  ['decimals()', ['view', 'uint8']],
  ['name()', ['view', 'string']],
  ['symbol()', ['view', 'string']],
  ['totalSupply()', ['view', 'uint256']],
  ['transfer(address,uint256)', ['nonpayable', 'bool']],
  ['transferFrom(address,address,uint256)', ['nonpayable', 'bool']],
]);

// These ERC-20 event names, argument types and indexed positions are part of
// offchain wallet/indexer interoperability. Do not allow silent event drift.
const expectedEvents = new Map([
  ['Approval(address,address,uint256)', [true, true, false]],
  ['Transfer(address,address,uint256)', [true, true, false]],
]);

const signature = (item) =>
  `${item.name}(${(item.inputs || []).map((input) => input.type).join(',')})`;
const functionNames = new Set();
const eventNames = new Set();
let constructorCount = 0;

for (const item of artifact.abi) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    fail('invalid ABI entry');
  }
  if (item.type === 'fallback' || item.type === 'receive') {
    fail(`unexpected ${item.type} entry`);
  }
  if (item.type === 'function') {
    if (!Array.isArray(item.inputs) || !Array.isArray(item.outputs)) {
      fail('function ABI must explicitly specify inputs and outputs');
    }
    const name = signature(item);
    if (!expectedFunctions.has(name)) fail(`unexpected callable function: ${name}`);
    if (functionNames.has(name)) fail(`duplicate callable function: ${name}`);
    const [mutability, output] = expectedFunctions.get(name);
    if (item.stateMutability !== mutability) {
      fail(`unexpected mutability for ${name}: ${item.stateMutability}`);
    }
    if (item.outputs.length !== 1 || item.outputs[0]?.type !== output) {
      fail(`unexpected return type for ${name}: expected ${output}`);
    }
    functionNames.add(name);
  } else if (item.type === 'event') {
    if (!Array.isArray(item.inputs)) fail('event inputs must be an array');
    const name = signature(item);
    if (!expectedEvents.has(name)) fail(`unexpected or malformed event: ${name}`);
    if (eventNames.has(name)) fail(`duplicate event: ${name}`);
    if (item.anonymous !== false) fail(`event must not be anonymous: ${name}`);
    const indexed = expectedEvents.get(name);
    if (item.inputs.length !== indexed.length ||
        item.inputs.some((input, index) => input.indexed !== indexed[index])) {
      fail(`unexpected event indexed flags: ${name}`);
    }
    eventNames.add(name);
  } else if (item.type === 'constructor') {
    constructorCount++;
    if (item.stateMutability !== 'nonpayable') fail('constructor must be nonpayable');
    if (!Array.isArray(item.inputs) ||
        item.inputs.map((input) => input.type).join(',') !== 'address,uint256') {
      fail('constructor must take initialHolder and initialSupplyBaseUnits');
    }
  } else if (item.type !== 'error') {
    // Solidity compiler may emit ERC-6093 or contract-specific errors. They do
    // not create callable methods. Unknown ABI entry kinds are not tolerated.
    fail(`unexpected ABI entry type: ${item.type}`);
  }
}
for (const name of expectedFunctions.keys()) {
  if (!functionNames.has(name)) fail(`missing standard ERC-20 function: ${name}`);
}
for (const name of expectedEvents.keys()) {
  if (!eventNames.has(name)) fail(`missing standard ERC-20 event: ${name}`);
}
if (constructorCount !== 1) fail('expected exactly one constructor');
console.log(`PASS: SpicaCash ABI has ${functionNames.size} standard ERC-20 functions, ${eventNames.size} events, exact output types and no extra callable methods`);
