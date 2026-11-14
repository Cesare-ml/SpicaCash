#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Offline grant proposal reconciliation. Never signs or issues any assets.
import { readSmallBytes } from './read-small-file.mjs';
import { assertDistinctBatchFiles } from './distinct-batch-files.mjs';
import { parseReviewJson } from './parse-review-json.mjs';
import { validateContributorGrants } from './contributor-grants-core.mjs';
import { validateTokenomics } from './tokenomics-core.mjs';
import { reconcileGrantBatches } from './grant-batches-core.mjs';

const usage = 'Usage: node scripts/check-grant-batches.mjs [--tokenomics <proposal.json>] [--require-proposal] <batch-a.json> [batch-b.json ...]';
let tokenomicsFile = null, requireProposal = false, invalid = false;
const paths = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--tokenomics' && tokenomicsFile === null && i + 1 < args.length &&
      !args[i + 1].startsWith('--')) {
    tokenomicsFile = args[++i];
  } else if (arg === '--require-proposal' && !requireProposal) {
    requireProposal = true;
  } else if (arg.startsWith('--')) {
    invalid = true;
  } else {
    paths.push(arg);
  }
}
if (invalid || paths.length === 0 || paths.length > 64) {
  console.error(usage);
  process.exitCode = 2;
} else {
  try {
    // Literal and alias paths must never double-count the same physical batch.
    assertDistinctBatchFiles(paths);
    const batches = paths.map((path) => ({
      name: path,
      plan: parseReviewJson(readSmallBytes(path))
    }));
    const tokenomics = tokenomicsFile === null
      ? null : parseReviewJson(readSmallBytes(tokenomicsFile));
    // Check any supplied economics even if all grant batches are empty drafts.
    // Otherwise an unsafe, well-formed tokenomics document goes unnoticed.
    const economicsCheck = tokenomics === null ? null : validateTokenomics(tokenomics);
    const result = economicsCheck !== null && !economicsCheck.valid
      ? { valid: false, errors: economicsCheck.errors.map(e => 'tokenomics.' + e) }
      : reconcileGrantBatches(
        batches, tokenomics, validateContributorGrants, { requireProposal }
      );
    if (!result.valid) {
      console.error('INVALID grant batches (no token distribution approved):');
      for (const error of result.errors) console.error(' - ' + error);
      process.exitCode = 1;
    } else {
      console.log('VALID review-only batch reconciliation — NOT approved for issuance, grants, payments or VirgoStars AI credits.');
      console.log('Batches: ' + result.batchCount);
      console.log('Proposed grants: ' + result.proposalCount);
      for (const [id, values] of Object.entries(result.totals)) {
        console.log(id + ' proposed base units: ' + values.proposedBaseUnits);
        console.log(id + ' unassigned base units: ' + values.unassignedBaseUnits);
      }
      console.log('GitHub merge status, reviewers, contributor identities and eligibility NOT verified.');
    }
  } catch (error) {
    console.error('Could not read or parse local JSON file: ' + error.message);
    process.exitCode = 2;
  }
}
