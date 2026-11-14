// SPDX-License-Identifier: MIT
// Local path identity checks for offline grant-batch review. No network access.
import { realpathSync, statSync } from 'node:fs';

/**
 * Reject repeat references to a physical file before reconciling proposal batches.
 * Identity checks are best-effort on mutable directories and network filesystems.
 */
export function assertDistinctBatchFiles(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 64) {
    throw new Error('expected 1 to 64 local grant batch paths');
  }
  const names = new Set();
  const identities = new Set();
  for (const path of paths) {
    const canonical = realpathSync(path);
    const stat = statSync(canonical, { bigint: true });
    if (!stat.isFile()) throw new Error('batch must be a regular file');
    // Hard-linked aliases have different paths but share device/inode numbers.
    // Some platforms may report zero inode identifiers: in that case, rely on
    // the canonical path check rather than rejecting unrelated files.
    const identity = stat.ino === 0n ? null : `${stat.dev}:${stat.ino}`;
    if (names.has(canonical) || (identity !== null && identities.has(identity))) {
      throw new Error('duplicate physical grant batch file');
    }
    names.add(canonical);
    if (identity !== null) identities.add(identity);
  }
}
