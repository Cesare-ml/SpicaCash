// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = resolve('scripts/check-abi.mjs');
const expected = [
  ['allowance', ['address', 'address'], 'view'],
  ['approve', ['address', 'uint256'], 'nonpayable'],
  ['balanceOf', ['address'], 'view'],
  ['decimals', [], 'view'],
  ['name', [], 'view'],
  ['symbol', [], 'view'],
  ['totalSupply', [], 'view'],
  ['transfer', ['address', 'uint256'], 'nonpayable'],
  ['transferFrom', ['address', 'address', 'uint256'], 'nonpayable'],
];
const standardAbi = () => [
  { type: 'constructor', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }] },
  ...expected.map(([name, args, stateMutability]) => ({
    type: 'function', name, stateMutability, inputs: args.map((type) => ({ type }))
  })),
  { type: 'event', name: 'Transfer', inputs: [] },
  { type: 'event', name: 'Approval', inputs: [] },
];

function check(abi) {
  const directory = mkdtempSync(join(tmpdir(), 'spica-abi-'));
  try {
    const artifact = join(directory, 'SpicaCash.json');
    writeFileSync(artifact, JSON.stringify({ abi }));
    return spawnSync(process.execPath, [scriptPath, artifact], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('standard ERC-20 ABI passes', () => {
  const run = check(standardAbi());
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /PASS: SpicaCash ABI/);
});

test('unexpected mint method fails', () => {
  const abi = standardAbi();
  abi.push({ type: 'function', name: 'mint', inputs: [{ type: 'address' }, { type: 'uint256' }], stateMutability: 'nonpayable' });
  const run = check(abi);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /unexpected callable function: mint/);
});

test('missing ERC-20 transfer method fails', () => {
  const abi = standardAbi().filter((item) => item.name !== 'transfer');
  const run = check(abi);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /missing standard ERC-20 function: transfer/);
});

test('incorrect constructor argument types fail', () => {
  const abi = standardAbi();
  abi[0].inputs[1].type = 'uint8';
  const run = check(abi);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /constructor must take/);
});

test('payable fallback or receiver fails', () => {
  const abi = standardAbi();
  abi.push({ type: 'receive', stateMutability: 'payable' });
  const run = check(abi);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /unexpected receive entry/);
});

test('unexpected payable function fails', () => {
  const abi = standardAbi();
  const transfer = abi.find((item) => item.name === 'transfer');
  transfer.stateMutability = 'payable';
  const run = check(abi);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /unexpected mutability for transfer/);
});
