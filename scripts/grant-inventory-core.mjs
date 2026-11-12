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
    const entries = readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue;
      if (!entry.isFile() || entry.isSymbolicLink()) {
        fail('inventoryDirectory/' + entry.name, 'JSON entry must be a regular file');
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
