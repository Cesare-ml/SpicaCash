// SPDX-License-Identifier: MIT
// Read-only manifest integrity checks; no GitHub, wallet or chain access.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const MAX_DOCUMENT_BYTES = 1024 * 1024;
const MAX_BATCHES = 64;
const HEX_SHA256 = /^[a-f0-9]{64}$/;

function exactShape(value, keys, path, errors) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(path + ': expected object');
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) errors.push(path + '.' + key + ': unexpected field');
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) errors.push(path + '.' + key + ': missing field');
  }
  return true;
}

function readSmallJson(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error('regular, non-symlink file required');
  }
  if (info.size > MAX_DOCUMENT_BYTES) throw new Error('file exceeds 1 MiB limit');
  const bytes = readFileSync(path);
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('file exceeds 1 MiB limit');
  return { bytes, value: JSON.parse(bytes.toString('utf8')) };
}

function relativeJsonPath(value) {
  if (typeof value !== 'string' || value.length > 240 ||
      !/^[a-zA-Z0-9_.\/-]+\.json$/.test(value) || value.includes('\\') ||
      value.includes('//') || isAbsolute(value)) return false;
  return value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Load a versioned manifest and the exact, hashed local JSON files it names.
 * No token issuance or payment authorization can result from this function.
 */
export function loadGrantManifest(manifestPath, options = {}) {
  const errors = [];
  const failure = (where, message) => errors.push(where + ': ' + message);
  const result = { valid: false, errors, batches: [], tokenomics: null, status: 'invalid' };
  let manifest;
  let base;
  try {
    const canonical = realpathSync(manifestPath);
    // Refuse aliases through a symlink at the manifest file itself.
    if (lstatSync(manifestPath).isSymbolicLink()) {
      throw new Error('symlink manifest not allowed');
    }
    base = dirname(canonical);
    manifest = readSmallJson(canonical).value;
  } catch (err) {
    failure('manifest', 'cannot read JSON: ' + err.message);
    return result;
  }
  if (!exactShape(manifest, [
    'schemaVersion', 'status', 'executionAuthorized', 'tokenomics', 'batches'
  ], 'manifest', errors)) return result;

  if (manifest.schemaVersion !== 1) failure('schemaVersion', 'expected version 1');
  if (!['draft', 'proposal'].includes(manifest.status)) {
    failure('status', 'must be draft or proposal');
  }
  if (manifest.executionAuthorized !== false) {
    failure('executionAuthorized', 'must remain false');
  }
  if (options.requireProposal === true && manifest.status !== 'proposal') {
    failure('status', 'a complete review proposal is required');
  }
  if (manifest.status === 'draft' && manifest.tokenomics !== null) {
    failure('tokenomics', 'draft must not select tokenomics');
  }
  if (!Array.isArray(manifest.batches) ||
      manifest.batches.length === 0 || manifest.batches.length > MAX_BATCHES) {
    failure('batches', 'expected 1 to 64 hashed batch files');
    return result;
  }
  const seen = new Set();
  const readEntry = (entry, where) => {
    if (!exactShape(entry, ['path', 'sha256'], where, errors)) return null;
    if (!relativeJsonPath(entry.path)) {
      failure(where + '.path', 'must be a safe relative .json path without traversal');
      return null;
    }
    if (typeof entry.sha256 !== 'string' || !HEX_SHA256.test(entry.sha256)) {
      failure(where + '.sha256', 'expected lowercase SHA-256 digest');
      return null;
    }
    const abs = resolve(base, entry.path);
    const rel = relative(base, abs);
    if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
      failure(where + '.path', 'path escapes the manifest directory');
      return null;
    }
    if (seen.has(abs)) {
      failure(where + '.path', 'duplicate file in manifest');
      return null;
    }
    seen.add(abs);
    try {
      if (realpathSync(abs) !== abs) {
        throw new Error('symlink or redirected path not allowed');
      }
      const { bytes, value } = readSmallJson(abs);
      if (sha256Hex(bytes) !== entry.sha256) {
        failure(where + '.sha256', 'file digest mismatch: possible modification');
        return null;
      }
      return { name: entry.path, value };
    } catch (err) {
      failure(where + '.path', 'cannot read verified JSON file: ' + err.message);
      return null;
    }
  };

  if (manifest.tokenomics !== null) {
    const e = readEntry(manifest.tokenomics, 'tokenomics');
    if (e) result.tokenomics = e.value;
  }
  manifest.batches.forEach((entry, i) => {
    const e = readEntry(entry, 'batches[' + i + ']');
    if (!e) return;
    if (!e.value || typeof e.value !== 'object' ||
        Array.isArray(e.value) || e.value.status !== manifest.status) {
      failure('batches[' + i + '].status', 'must match the manifest review status');
    } else {
      result.batches.push({ name: e.name, plan: e.value });
    }
  });
  if (manifest.status === 'proposal' && manifest.tokenomics === null) {
    failure('tokenomics', 'proposal requires a hashed tokenomics file');
  }
  result.status = manifest.status;
  result.valid = errors.length === 0;
  return result;
}
