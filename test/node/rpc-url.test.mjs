// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const validator = resolve(root, 'scripts/validate-rpc-url.mjs');
const check = (value) => {
  const env = { ...process.env };
  if (value === undefined) delete env.ARBITRUM_SEPOLIA_RPC_URL;
  else env.ARBITRUM_SEPOLIA_RPC_URL = value;
  return spawnSync(process.execPath, [validator], { env, encoding: 'utf8' });
};
const valid = (name, value) => test(name, () => {
  const r = check(value);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
});
const invalid = (name, value, pattern) => test(name, () => {
  const r = check(value);
  assert.equal(r.status, 1, `${r.stdout} ${r.stderr}`);
  assert.match(r.stderr, pattern);
  assert.equal(r.stdout, '');
  if (value && value.includes('SECRET_VALUE')) {
    assert.doesNotMatch(r.stderr, /SECRET_VALUE/);
  }
});

valid('HTTPS RPC hostname is accepted', 'https://rpc.example.test');
valid('HTTPS RPC path and query are accepted without echoing secrets', 'https://rpc.example.test/v2/SECRET_VALUE?key=SECRET_VALUE');
valid('HTTPS RPC explicit port is accepted', 'https://rpc.example.test:443/rpc');
invalid('RPC URL is required', undefined, /missing URL/);
invalid('HTTP transport is refused', 'http://rpc.example.test', /HTTPS required/);
invalid('file transport is refused', 'file:///etc/passwd', /HTTPS required/);
invalid('username password in URL is refused', 'https://alice:SECRET_VALUE@rpc.example.test/', /embedded URL credentials/);
invalid('username only in URL is refused', 'https://alice@rpc.example.test/', /embedded URL credentials/);
invalid('fragment is refused', 'https://rpc.example.test/#SECRET_VALUE', /fragments/);
invalid('leading whitespace is refused', ' https://rpc.example.test/', /whitespace/);
invalid('embedded newline is refused', 'https://rpc.example.test/\nSECRET_VALUE', /whitespace/);
invalid('backslash is refused', 'https://rpc.example.test\\@bad.test/', /backslash/);
invalid('hostname is required', 'https://', /missing URL|malformed URL/);
invalid('bad TCP port is refused', 'https://rpc.example.test:99999', /malformed URL/);
invalid('malformed IPv6 address is refused', 'https://[bad-ipv6]/', /malformed URL/);
invalid('excessively long URL is refused', 'https://rpc.example.test/' + 'x'.repeat(2100), /invalid length/);
invalid('noncanonical capital scheme is refused', 'HTTPS://rpc.example.test', /HTTPS required/);
invalid('userinfo must be separated from endpoint authority', 'https://alice%40example.org@rpc.example.test', /embedded URL credentials/);
