// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkGrantInventory } from '../../scripts/grant-inventory-core.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'spica-inventory-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const manifest = join(dir, 'manifest.json');
  const inventory = join(dir, 'batch-proposals');
  mkdirSync(inventory);
  writeFileSync(manifest, '{}\n');
  writeFileSync(join(inventory, 'grant-a.json'), '{}\n');
  return { dir, manifest, inventory, batches: [{ name: 'batch-proposals/grant-a.json', plan: {} }] };
}
const check = (f, subdir = 'batch-proposals', batches = f.batches) =>
  checkGrantInventory(f.manifest, subdir, batches);

test('complete scoped inventory succeeds', t => {
  const f = fixture(t), result = check(f);
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.declaredFiles, 1);
  assert.equal(result.discoveredFiles, 1);
});
test('unlisted JSON batch is rejected', t => {
  const f = fixture(t);
  writeFileSync(join(f.inventory, 'forgotten.json'), '{}\n');
  assert.match(check(f).errors.join('\n'), /unlisted JSON batch file/);
});
test('non-JSON notes are ignored', t => {
  const f = fixture(t);
  writeFileSync(join(f.inventory, 'README.md'), 'notes');
  assert.equal(check(f).valid, true);
});
test('case-varied JSON extensions are rejected rather than silently skipped', t => {
  const f = fixture(t);
  writeFileSync(join(f.inventory, 'hidden.JSON'), '{}\n');
  writeFileSync(join(f.inventory, 'hidden2.Json'), '{}\n');
  const report = check(f);
  assert.equal(report.valid, false);
  assert.equal(report.errors.filter(e => /JSON extension must be lowercase/.test(e)).length, 2);
});
test('unlisted batch diagnostics are sorted deterministically', t => {
  const f = fixture(t);
  writeFileSync(join(f.inventory, 'z-extra.json'), '{}\n');
  writeFileSync(join(f.inventory, 'a-extra.json'), '{}\n');
  const errors = check(f).errors.filter(e => /unlisted JSON batch file/.test(e));
  assert.deepEqual(errors, [
    'inventoryDirectory/a-extra.json: unlisted JSON batch file',
    'inventoryDirectory/z-extra.json: unlisted JSON batch file'
  ]);
});
test('manifest-listed batch in a different directory is rejected', t => {
  const f = fixture(t);
  assert.match(check(f, 'batch-proposals', [{ name: 'somewhere/grant-a.json' }]).errors.join('\n'), /outside/);
});
test('duplicate manifest names are rejected', t => {
  const f = fixture(t);
  assert.match(check(f, 'batch-proposals', [f.batches[0], f.batches[0]]).errors.join('\n'), /duplicate batch/);
});
test('traversal and absolute inventory dirs are rejected', t => {
  const f = fixture(t);
  assert.match(check(f, '../sibling').errors.join('\n'), /safe relative/);
  assert.equal(check(f, f.inventory).valid, false);
});
test('a symbolic link pretending to be a batch is rejected', t => {
  const f = fixture(t);
  try { symlinkSync(join(f.inventory, 'grant-a.json'), join(f.inventory, 'forgotten.json')); }
  catch (error) { if (error.code === 'EPERM') { t.skip('No symlink privileges'); return; } throw error; }
  assert.match(check(f).errors.join('\n'), /symlinks are not allowed/);
});
test('symlinked inventory directory is rejected', t => {
  const f = fixture(t);
  try { symlinkSync(f.inventory, join(f.dir, 'shadow'), 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('No symlink privileges'); return; } throw error; }
  assert.equal(check(f, 'shadow').valid, false);
});
test('empty nested directories are rejected in a flat inventory', t => {
  const f = fixture(t);
  mkdirSync(join(f.inventory, 'archive'));
  assert.match(check(f).errors.join('\n'), /nested directories are not allowed/);
});
test('nested unlisted JSON grants cannot hide under an inventory', t => {
  const f = fixture(t);
  mkdirSync(join(f.inventory, 'more-grants'));
  writeFileSync(join(f.inventory, 'more-grants', 'hidden.json'), '{}\n');
  const result = check(f);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /nested directories are not allowed/);
});
test('non-JSON symlink aliases are rejected too', t => {
  const f = fixture(t);
  try { symlinkSync(join(f.inventory, 'grant-a.json'), join(f.inventory, 'notes.md')); }
  catch (error) { if (error.code === 'EPERM') { t.skip('No symlink privileges'); return; } throw error; }
  assert.match(check(f).errors.join('\n'), /symlinks are not allowed/);
});
test('empty or malformed batch list is rejected', t => {
  const f = fixture(t);
  assert.equal(check(f, 'batch-proposals', []).valid, false);
  assert.equal(check(f, 'batch-proposals', null).valid, false);
});
test('missing inventory folder is rejected', t => {
  const f = fixture(t);
  assert.equal(check(f, 'missing').valid, false);
});
