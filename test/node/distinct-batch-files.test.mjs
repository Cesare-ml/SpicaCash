// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { linkSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDistinctBatchFiles } from '../../scripts/distinct-batch-files.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'spica-batch-identity-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const a = join(dir, 'a.json'), b = join(dir, 'b.json');
  writeFileSync(a, '{}\n');
  writeFileSync(b, '{}\n');
  return { dir, a, b };
}

test('accepts two distinct regular batch files', t => {
  const f = fixture(t);
  assert.doesNotThrow(() => assertDistinctBatchFiles([f.a, f.b]));
});
test('rejects a literal duplicate batch filename', t => {
  const f = fixture(t);
  assert.throws(() => assertDistinctBatchFiles([f.a, f.a]), /duplicate physical/);
});
test('rejects differently written paths resolving to the same batch', t => {
  const f = fixture(t);
  assert.throws(() => assertDistinctBatchFiles([f.a, f.dir + '/./a.json']), /duplicate physical/);
});
test('rejects a symlink alias of an existing batch', t => {
  const f = fixture(t), alias = join(f.dir, 'alias.json');
  try { symlinkSync(f.a, alias); }
  catch (error) { if (['EPERM', 'ENOTSUP'].includes(error.code)) { t.skip('symlink unsupported'); return; } throw error; }
  assert.throws(() => assertDistinctBatchFiles([f.a, alias]), /duplicate physical/);
});
test('rejects a hard-linked alias where supported', t => {
  const f = fixture(t), alias = join(f.dir, 'hardlink.json');
  try { linkSync(f.a, alias); }
  catch (error) { if (['EPERM', 'ENOTSUP'].includes(error.code)) { t.skip('hardlink unsupported'); return; } throw error; }
  assert.throws(() => assertDistinctBatchFiles([f.a, alias]), /duplicate physical/);
});
test('fails closed on missing paths and non-files', t => {
  const f = fixture(t);
  assert.throws(() => assertDistinctBatchFiles([join(f.dir, 'missing.json')]), /ENOENT/);
  assert.throws(() => assertDistinctBatchFiles([f.dir]), /regular file/);
});
test('enforces the existing 64-batch limit', t => {
  const f = fixture(t);
  assert.throws(() => assertDistinctBatchFiles([]), /1 to 64/);
  assert.throws(() => assertDistinctBatchFiles(Array(65).fill(f.a)), /1 to 64/);
});
