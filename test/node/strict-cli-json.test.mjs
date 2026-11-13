// SPDX-License-Identifier: MIT
// Offline CLI input tests; synthetic drafts only. No wallets or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const grantDraft = readFileSync(join(root, 'config/contributor-grants.draft.json'), 'utf8');
const tokenomicsDraft = readFileSync(join(root, 'config/tokenomics.draft.json'), 'utf8');

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'spica-cli-strict-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, file: join(dir, 'review.json'), companion: join(dir, 'tokenomics.json') };
}

function run(command, ...args) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', command), ...args], {
    encoding: 'utf8', timeout: 5000
  });
  assert.equal(result.error, undefined, String(result.error));
  return result;
}

const commands = [
  { name: 'tokenomics', command: 'validate-tokenomics.mjs', draft: tokenomicsDraft },
  { name: 'contributor grants', command: 'validate-contributor-grants.mjs', draft: grantDraft },
  { name: 'batch reconciliation', command: 'check-grant-batches.mjs', draft: grantDraft }
];

for (const entry of commands) {
  test(entry.name + ' accepts a clean empty draft without authorizing anything', t => {
    const f = fixture(t);
    writeFileSync(f.file, entry.draft);
    const r = run(entry.command, f.file);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /NOT approved/i);
  });

  test(entry.name + ' rejects contradictory duplicate authority keys', t => {
    const f = fixture(t);
    const text = JSON.stringify(JSON.parse(entry.draft));
    const bad = text.replace('"deploymentApproved":false',
      '"deploymentApproved":true,"deploymentApproved":false');
    assert.notEqual(bad, text);
    writeFileSync(f.file, bad);
    const r = run(entry.command, f.file);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /duplicate JSON object key/);
    assert.doesNotMatch(r.stdout, /VALID/);
  });

  test(entry.name + ' rejects malformed UTF-8 bytes', t => {
    const f = fixture(t);
    writeFileSync(f.file, Buffer.concat([
      Buffer.from('{"status":"'), Buffer.from([0xff]), Buffer.from('"}')
    ]));
    const r = run(entry.command, f.file);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /encoded|UTF-8|valid/i);
    assert.doesNotMatch(r.stdout, /VALID/);
  });
}

for (const entry of commands.filter(x => x.name !== 'tokenomics')) {
  test(entry.name + ' strictly parses optional tokenomics JSON', t => {
    const f = fixture(t);
    writeFileSync(f.file, entry.draft);
    const companion = JSON.stringify(JSON.parse(tokenomicsDraft)).replace(
      '"deploymentApproved":false',
      '"deploymentApproved":true,"deploymentApproved":false');
    writeFileSync(f.companion, companion);
    const r = run(entry.command, f.file, '--tokenomics', f.companion);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /duplicate JSON object key/);
  });
}

test('standalone tokenomics CLI rejects Unicode-escaped duplicate field aliases', t => {
  const f = fixture(t);
  const clean = JSON.stringify(JSON.parse(tokenomicsDraft));
  const bad = clean.replace('"deploymentApproved":false',
    '"deploymentApproved":false,"\\u0064eploymentApproved":false');
  writeFileSync(f.file, bad);
  const r = run('validate-tokenomics.mjs', f.file);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /duplicate JSON object key/);
});

test('standalone tokenomics CLI rejects duplicate fields nested in the plan', t => {
  const f = fixture(t);
  const clean = JSON.stringify(JSON.parse(tokenomicsDraft));
  const bad = clean.replace('"aiCreditConversionEnabled":false',
    '"aiCreditConversionEnabled":true,"aiCreditConversionEnabled":false');
  writeFileSync(f.file, bad);
  const r = run('validate-tokenomics.mjs', f.file);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /duplicate JSON object key/);
});

for (const entry of commands) {
  test(entry.name + ' rejects a document larger than 1 MiB before JSON parsing', t => {
    const f = fixture(t);
    writeFileSync(f.file, Buffer.alloc(1024 * 1024 + 1, 0x20));
    const r = run(entry.command, f.file);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /exceeds 1 MiB limit/);
    assert.doesNotMatch(r.stdout, /VALID/);
  });

  test(entry.name + ' refuses a symlinked input instead of following it', t => {
    const f = fixture(t);
    writeFileSync(f.companion, entry.draft);
    try { symlinkSync(f.companion, f.file); }
    catch (error) {
      if (['EPERM', 'ENOTSUP'].includes(error.code)) {
        t.skip('symlinks unavailable to this user');
        return;
      }
      throw error;
    }
    const r = run(entry.command, f.file);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /regular, non-symlink file required/);
  });
}

for (const entry of commands.filter(x => x.name !== 'tokenomics')) {
  test(entry.name + ' refuses oversized companion tokenomics input', t => {
    const f = fixture(t);
    writeFileSync(f.file, entry.draft);
    writeFileSync(f.companion, Buffer.alloc(1024 * 1024 + 1, 0x20));
    const r = run(entry.command, f.file, '--tokenomics', f.companion);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /exceeds 1 MiB limit/);
  });
}

for (const entry of commands) {
  test(entry.name + ' rejects directory as a primary review input', t => {
    const f = fixture(t);
    mkdirSync(f.file);
    const r = run(entry.command, f.file);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /regular, non-symlink file required/);
    assert.doesNotMatch(r.stdout, /VALID/);
  });
}

for (const entry of commands.filter(x => x.name !== 'tokenomics')) {
  test(entry.name + ' rejects symlinked companion tokenomics JSON', t => {
    const f = fixture(t);
    writeFileSync(f.file, entry.draft);
    writeFileSync(f.companion, tokenomicsDraft);
    const alias = join(f.dir, 'tokenomics-alias.json');
    try { symlinkSync(f.companion, alias); }
    catch (error) {
      if (['EPERM', 'ENOTSUP'].includes(error.code)) {
        t.skip('symlinks unavailable to this user');
        return;
      }
      throw error;
    }
    const r = run(entry.command, f.file, '--tokenomics', alias);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /regular, non-symlink file required/);
    assert.doesNotMatch(r.stdout, /VALID/);
  });
}

test('batch CLI rejects a second lexical path alias to the same file', t => {
  const f = fixture(t);
  writeFileSync(f.file, grantDraft);
  const r = run('check-grant-batches.mjs', f.file, f.dir + '/./review.json');
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /duplicate physical grant batch file/);
  assert.doesNotMatch(r.stdout, /VALID/);
});
test('batch CLI rejects hard-linked copies of a single physical draft', t => {
  const f = fixture(t);
  writeFileSync(f.file, grantDraft);
  try { linkSync(f.file, f.companion); }
  catch (error) {
    if (['EPERM', 'ENOTSUP'].includes(error.code)) {
      t.skip('hardlink unsupported');
      return;
    }
    throw error;
  }
  const r = run('check-grant-batches.mjs', f.file, f.companion);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /duplicate physical grant batch file/);
  assert.doesNotMatch(r.stdout, /VALID/);
});
