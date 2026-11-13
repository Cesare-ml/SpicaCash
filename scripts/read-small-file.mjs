// SPDX-License-Identifier: MIT
// Bounded, descriptor-based reads for local SHA-256-pinned JSON reviews.
// No network, wallet, or signing access.
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';

const MAX_DOCUMENT_BYTES = 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;

/** Read raw bytes without following a final-component symlink or unbounded growth. */
export function readSmallBytes(path) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error('regular, non-symlink file required');
  }
  if (before.size > MAX_DOCUMENT_BYTES) throw new Error('file exceeds 1 MiB limit');

  // O_NOFOLLOW is available on POSIX. Windows also receives a post-open inode
  // check, but cannot be claimed to have the same atomic symlink protection.
  const flags = constants.O_RDONLY |
    (process.platform !== 'win32' && typeof constants.O_NOFOLLOW === 'number'
      ? constants.O_NOFOLLOW : 0);
  const fd = openSync(path, flags);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || before.dev !== opened.dev || before.ino !== opened.ino) {
      throw new Error('file changed while opening');
    }
    if (opened.size > MAX_DOCUMENT_BYTES) throw new Error('file exceeds 1 MiB limit');
    // Read one byte past the allowed size so a growing file cannot bypass the
    // bound after the initial size checks.
    const parts = [];
    let total = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(CHUNK_BYTES, MAX_DOCUMENT_BYTES + 1 - total));
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      total += count;
      if (total > MAX_DOCUMENT_BYTES) throw new Error('file exceeds 1 MiB limit');
      parts.push(chunk.subarray(0, count));
    }
    return Buffer.concat(parts, total);
  } finally {
    closeSync(fd);
  }
}
