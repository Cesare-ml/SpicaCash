#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Local, read-only integrity check. NEVER grants rights or issues tokens.
import { loadGrantManifest } from './grant-manifest-core.mjs';
import { validateContributorGrants } from './contributor-grants-core.mjs';
import { reconcileGrantBatches } from './grant-batches-core.mjs';

const args = process.argv.slice(2);
const requireProposal = args.includes('--require-proposal');
const paths = args.filter(x => x !== '--require-proposal');
if (paths.length !== 1 || paths[0].startsWith('--') ||
    args.filter(x => x === '--require-proposal').length > 1) {
  console.error('Usage: node scripts/check-grant-manifest.mjs <manifest.json> [--require-proposal]');
  process.exitCode = 2;
} else {
  const manifest = loadGrantManifest(paths[0], { requireProposal });
  if (!manifest.valid) {
    console.error('INVALID grant manifest (no issuance authorized):');
    for (const error of manifest.errors) console.error(' - ' + error);
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
      console.log('Verified batches: ' + result.batchCount);
      console.log('Proposed grants: ' + result.proposalCount);
      for (const [key, value] of Object.entries(result.totals)) {
        console.log(key + ': proposed ' + value.proposedBaseUnits +
          ', unassigned ' + value.unassignedBaseUnits + ' base units');
      }
      console.log('Manifest inclusion, GitHub evidence and signer identity NOT independently verified.');
    }
  }
}
