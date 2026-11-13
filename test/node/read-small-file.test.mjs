// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, mkdirSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readSmallBytes } from '../../scripts/read-small-file.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'spica-safe-read-'));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  return { dir, path: join(dir, 'proposal.json') };
}

test('reads exactly the original JSON bytes, not reserialized data', t => {
  const f = fixture(t), bytes = Buffer.from('{"status":"draft"}\r\n');
  writeFileSync(f.path, bytes);
  assert.deepEqual(readSmallBytes(f.path), bytes);
});
test('accepts an empty regular file (JSON parsing remains a caller check)', t => {
  const f = fixture(t);
  writeFileSync(f.path, '');
  assert.equal(readSmallBytes(f.path).length, 0);
});
test('accepts 1 MiB exactly', t => {
  const f = fixture(t), bytes = Buffer.alloc(1024 * 1024, 65);
  writeFileSync(f.path, bytes);
  assert.deepEqual(readSmallBytes(f.path), bytes);
});
test('rejects 1 MiB plus one byte', t => {
  const f = fixture(t);
  writeFileSync(f.path, Buffer.alloc(1024 * 1024 + 1, 66));
  assert.throws(() => readSmallBytes(f.path), /exceeds 1 MiB limit/);
});
test('rejects a directory instead of reading it', t => {
  const f = fixture(t);
  mkdirSync(f.path);
  assert.throws(() => readSmallBytes(f.path), /regular, non-symlink/);
});
test('rejects a final-component symlink', t => {
  const f = fixture(t), alias = join(f.dir, 'alias.json');
  writeFileSync(f.path, '{}');
  try { symlinkSync(f.path, alias); }
  catch (e) { if (e.code === 'EPERM') { t.skip('symlink permission denied'); return; } throw e; }
  assert.throws(() => readSmallBytes(alias), /regular, non-symlink/);
});
test('hard-linked regular files remain readable and hashable', t => {
  const f = fixture(t), alias = join(f.dir, 'other.json');
  writeFileSync(f.path, '{"x":1}');
  try { linkSync(f.path, alias); }
  catch (e) { if (['EPERM','ENOTSUP'].includes(e.code)) { t.skip('hardlinks unsupported'); return; } throw e; }
  assert.deepEqual(readSmallBytes(alias), readSmallBytes(f.path));
});
test('missing file fails closed', t => {
  const f = fixture(t);
  assert.throws(() => readSmallBytes(f.path), /ENOENT/);
});
test('multiple sequential reads do not leak an open descriptor', t => {
  const f = fixture(t);
  writeFileSync(f.path, '{"ok":true}');
  for (let i = 0; i < 100; i++) assert.equal(readSmallBytes(f.path).length, 11);
});

test('rejects named pipes rather than treating them as review JSON', t => {
  if (process.platform === 'win32') { t.skip('mkfifo is not available on Windows'); return; }
  const f = fixture(t);
  const mkfifo = spawnSync('mkfifo', [f.path], { encoding: 'utf8', timeout: 2000 });
  if (mkfifo.error?.code === 'ENOENT') { t.skip('mkfifo unavailable'); return; }
  assert.equal(mkfifo.status, 0, mkfifo.stderr || String(mkfifo.error));
  assert.throws(() => readSmallBytes(f.path), /regular, non-symlink/);
});
