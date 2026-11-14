// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkFoundryConfig } from '../../scripts/check-foundry-config.mjs';

const original = readFileSync(new URL('../../foundry.toml', import.meta.url), 'utf8');

function shouldReject(label, mutated, match) {
  test(label, () => {
    const result = checkFoundryConfig(mutated);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), match);
  });
}

test('the checked-in Foundry profile is explicitly reviewed', () => {
  assert.deepEqual(checkFoundryConfig(original), { valid: true, errors: [] });
});

test('CRLF and harmless surrounding spacing do not weaken the review', () => {
  assert.equal(checkFoundryConfig(original.replace(/\n/g, '\r\n')).valid, true);
  assert.equal(checkFoundryConfig(original.replace('runs = 64', 'runs   =   64')).valid, true);
});

shouldReject('unreviewed Solidity compiler is refused',
  original.replace('solc_version = "0.8.24"', 'solc_version = "0.8.25"'), /solc_version/);
shouldReject('missing compiler setting is refused',
  original.replace('solc_version = "0.8.24"', ''), /missing Foundry setting.*solc_version/);
shouldReject('unexpected fork/RPC URL setting is refused',
  original.replace('optimizer = true', 'eth_rpc_url = "https://example.invalid"\noptimizer = true'),
  /unapproved Foundry key/);
shouldReject('unreviewed profile is refused',
  original + '\n[rpc_endpoints]\nmainnet = "https://example.invalid"\n',
  /unexpected Foundry section/);
shouldReject('invariant revert weakening is refused',
  original.replace('fail_on_revert = true', 'fail_on_revert = false'),
  /fail_on_revert/);
shouldReject('lower invariant run budget is refused',
  original.replace('runs = 64', 'runs = 1'), /profile.default.invariant.runs/);
shouldReject('lower invariant depth is refused',
  original.replace('depth = 64', 'depth = 4'), /depth/);
shouldReject('disabling selector metrics is refused',
  original.replace('show_metrics = true', 'show_metrics = false'), /show_metrics/);
shouldReject('reduced fuzz test count is refused',
  original.replace('runs = 256', 'runs = 1'), /profile.default.fuzz.runs/);
shouldReject('alternate remapping is refused',
  original.replace('remappings = ["@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/"]',
    'remappings = ["@openzeppelin/contracts/=untrusted/"]'), /remappings/);
shouldReject('duplicate compiler value is refused',
  original.replace('solc_version = "0.8.24"',
    'solc_version = "0.8.24"\nsolc_version = "0.8.24"'), /duplicate Foundry key/);
shouldReject('duplicate invariant section is refused',
  original + '\n[profile.default.invariant]\nruns = 64\n', /duplicate Foundry section/);
shouldReject('missing complete section is refused',
  original.replace('[profile.default.fuzz]', '# removed fuzz section'),
  /missing Foundry section.*fuzz/);
shouldReject('oversized config is refused',
  original + '#a'.repeat(9000), /larger than 16 KiB/);
shouldReject('malformed TOML cannot silently change behavior',
  original.replace('optimizer = true', 'optimizer := true'), /unrecognized Foundry setting/);
shouldReject('unapproved additional compiler settings are refused',
  original.replace('optimizer = true', 'via_ir = true\noptimizer = true'), /unapproved Foundry key/);
shouldReject('profile section misspelling is refused',
  original.replace('[profile.default]', '[profile.production]'), /unexpected Foundry section/);

test('plain comments do not change the reviewed profile', () => {
  assert.equal(checkFoundryConfig('# comment\n' + original + '\n# end\n').valid, true);
});
