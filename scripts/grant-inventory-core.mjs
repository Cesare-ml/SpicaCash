// SPDX-License-Identifier: MIT
// Local filesystem inventory only. No GitHub access, wallet, or signing.
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

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
    // A review folder must be flat. Ignoring child directories would create a
    // misleading "complete" inventory when another batch is hidden below one.
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const location = 'inventoryDirectory/' + entry.name;
      if (entry.isDirectory()) {
        fail(location, 'nested directories are forbidden in a flat batch inventory');
        continue;
      }
      if (entry.isSymbolicLink()) {
        fail(location, entry.name.toLowerCase().endsWith('.json')
          ? 'JSON entry must be a regular file (no symlinks)'
          : 'symlinks are forbidden in a flat batch inventory');
        continue;
      }
      // Detect noncanonical .JSON/.Json rather than silently ignoring them.
      if (!/\.json$/i.test(entry.name)) continue;
      if (!entry.name.endsWith('.json')) {
        fail(location, 'JSON extension must be lowercase .json');
        continue;
      }
      if (!entry.isFile()) {
        fail(location, 'JSON entry must be a regular file');
        continue;
      }
      discovered.push(entry.name);
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
