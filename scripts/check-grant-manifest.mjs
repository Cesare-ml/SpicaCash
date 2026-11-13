#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Read-only local review. Does not contact blockchain, GitHub or wallets.
import { loadGrantManifest } from './grant-manifest-core.mjs';
import { checkGrantInventory } from './grant-inventory-core.mjs';
import { validateContributorGrants } from './contributor-grants-core.mjs';
import { reconcileGrantBatches } from './grant-batches-core.mjs';

const args = process.argv.slice(2);
const usage = 'Usage: node scripts/check-grant-manifest.mjs <manifest.json> [--require-proposal] [--inventory-dir <relative-folder>] [--expected-manifest-sha256 <64-lowercase-hex>]';
const paths = [];
let requireProposal = false, inventoryDir = null, expectedManifestSha256 = null, invalid = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--require-proposal' && !requireProposal) {
    requireProposal = true;
  } else if (args[i] === '--inventory-dir' && inventoryDir === null &&
             i + 1 < args.length && !args[i + 1].startsWith('--')) {
    inventoryDir = args[++i];
  } else if (args[i] === '--expected-manifest-sha256' &&
             expectedManifestSha256 === null && i + 1 < args.length &&
             /^[a-f0-9]{64}$/.test(args[i + 1])) {
    expectedManifestSha256 = args[++i];
  } else if (args[i].startsWith('--')) {
    invalid = true;
  } else {
    paths.push(args[i]);
  }
}
if (invalid || paths.length !== 1) {
  console.error(usage);
  process.exitCode = 2;
} else {
  const manifest = loadGrantManifest(paths[0], { requireProposal, ...(expectedManifestSha256 === null ? {} : { expectedManifestSha256 }) });
  if (!manifest.valid) {
    console.error('INVALID grant manifest (no issuance authorized):');
    for (const error of manifest.errors) console.error(' - ' + error);
    process.exitCode = 1;
  } else {
    const inventory = inventoryDir === null
      ? null : checkGrantInventory(paths[0], inventoryDir, manifest.batches);
    if (inventory !== null && !inventory.valid) {
      console.error('INVALID scoped batch inventory (no issuance authorized):');
      for (const error of inventory.errors) console.error(' - ' + error);
      process.exitCode = 1;
    } else {
      const result = reconcileGrantBatches(
        manifest.batches, manifest.tokenomics, validateContributorGrants,
        { requireProposal }
      );
      if (!result.valid) {
        console.error('INVALID reconciled grant manifest (no issuance authorized):');
        for (const error of result.errors) console.error(' - ' + error);
        process.exitCode = 1;
      } else {
        console.log(
          'VALID review-only manifest; SHA-256 checks passed. NOT approved for issuance, payment or AI-credit conversion.'
        );
        console.log('Status: ' + manifest.status);
        console.log('Manifest SHA-256: ' + manifest.manifestSha256 +
                    ' (review fingerprint only; not a signature or authorization)');
        console.log('Verified batches: ' + result.batchCount);
        console.log('Proposed grants: ' + result.proposalCount);
        for (const [key, value] of Object.entries(result.totals)) {
          console.log(key + ': proposed ' + value.proposedBaseUnits +
            ', unassigned ' + value.unassignedBaseUnits + ' base units');
        }
        if (inventory !== null) {
          console.log('Scoped inventory checked: ' + inventory.discoveredFiles +
                      ' JSON files, all present in manifest.');
        } else {
          console.log('Scoped inventory NOT checked; unlisted files may exist.');
        }
        console.log('Manifest completeness outside the checked folder, GitHub evidence and signer identity NOT verified.');
      }
    }
  }
}
