// SPDX-License-Identifier: MIT
// Local filesystem inventory only. No GitHub access, wallet, or signing.
import { lstatSync, opendirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

// At most 64 batches; permit review notes but reject oversized input folders.
const MAX_INVENTORY_ENTRIES = 128;

export function checkGrantInventory(manifestPath, inventoryDirectory, verifiedBatches) {
  const errors = [];
  const fail = (field, reason) => errors.push(field + ': ' + reason);
  const result = { valid: false, errors, declaredFiles: 0, discoveredFiles: 0 };

  if (typeof inventoryDirectory !== 'string' || inventoryDirectory.length > 240 ||
      !/^[a-zA-Z0-9_.\/-]+$/.test(inventoryDirectory) ||
      inventoryDirectory.includes('\\') || inventoryDirectory.includes('//') ||
      isAbsolute(inventoryDirectory) ||
      (inventoryDirectory !== '.' && inventoryDirectory.split('/').some(part =>
        part === '' || part === '.' || part === '..'))) {
    fail('inventoryDirectory', 'must be a safe relative directory without traversal');
    return result;
  }
  if (!Array.isArray(verifiedBatches) || verifiedBatches.length === 0 ||
      verifiedBatches.length > 64) {
    fail('verifiedBatches', 'expected 1 to 64 verified manifest batches');
    return result;
  }

  let directory;
  try {
    const base = dirname(realpathSync(manifestPath));
    directory = resolve(base, inventoryDirectory);
    const back = relative(base, directory);
    if (back === '..' || back.startsWith('..' + sep) || isAbsolute(back)) {
      throw new Error('inventory directory escapes manifest directory');
    }
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(directory) !== directory) {
      throw new Error('inventory directory must be a real, non-symlinked directory');
    }
  } catch (error) {
    fail('inventoryDirectory', error.message);
    return result;
  }

  const declared = new Set();
  for (const [index, batch] of verifiedBatches.entries()) {
    const name = batch?.name;
    if (typeof name !== 'string' || !name.endsWith('.json')) {
      fail('verifiedBatches[' + index + ']', 'expected a verified JSON batch name');
      continue;
    }
    const absolute = resolve(dirname(realpathSync(manifestPath)), name);
    if (dirname(absolute) !== directory) {
      fail('verifiedBatches[' + index + ']', 'batch is outside the declared inventory directory');
      continue;
    }
    const filename = basename(absolute);
    if (declared.has(filename)) fail('verifiedBatches[' + index + ']', 'duplicate batch name');
    declared.add(filename);
  }

  let discovered = [];
  try {
    // Stream a bounded prefix, rather than allocating an unbounded readdir array.
    // If a folder exceeds the limit, the result is always invalid regardless
    // of whether the manifest-listed files appear in the prefix.
    const stream = opendirSync(directory);
    const entries = [];
    try {
      for (;;) {
        const entry = stream.readSync();
        if (entry === null) break;
        if (entries.length >= MAX_INVENTORY_ENTRIES) {
          fail('inventoryDirectory',
            'exceeds ' + MAX_INVENTORY_ENTRIES + ' entries; use a dedicated review folder');
          break;
        }
        entries.push(entry);
      }
    } finally {
      stream.closeSync();
    }
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    // Fail closed on nested folders, aliases and special files. Otherwise a
    // reviewer could overlook batches hidden below a supposedly flat inventory.
    for (const entry of entries) {
      const where = 'inventoryDirectory/' + entry.name;
      if (entry.isDirectory()) {
        fail(where, 'nested directories are not allowed in a flat batch inventory');
        continue;
      }
      if (entry.isSymbolicLink()) {
        fail(where, 'symlinks are not allowed in a flat batch inventory');
        continue;
      }
      if (!entry.isFile()) {
        fail(where, 'non-regular filesystem entries are not allowed');
        continue;
      }
      // Non-JSON regular files (for example README.md) remain documentation.
      // Mixed-case JSON suffixes must never disappear from the inventory silently.
      if (/\.json$/i.test(entry.name)) {
        if (!entry.name.endsWith('.json')) {
          fail(where, 'JSON extension must be lowercase .json');
          continue;
        }
        discovered.push(entry.name);
      }
    }
  } catch (error) {
    fail('inventoryDirectory', 'cannot enumerate JSON files: ' + error.message);
  }
  const present = new Set(discovered);
  for (const filename of discovered) {
    if (!declared.has(filename)) fail('inventoryDirectory/' + filename, 'unlisted JSON batch file');
  }
  for (const filename of declared) {
    if (!present.has(filename)) fail('verifiedBatches/' + filename, 'manifest-listed batch is missing from inventory');
  }
  result.declaredFiles = declared.size;
  result.discoveredFiles = present.size;
  result.valid = errors.length === 0;
  return result;
}
