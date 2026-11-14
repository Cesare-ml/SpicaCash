#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Read-only CLI. Does not authenticate GitHub PRs or approve grants.
import { readSmallBytes } from './read-small-file.mjs';
import { parseReviewJson } from './parse-review-json.mjs';
import { validateContributorGrants } from './contributor-grants-core.mjs';
import { validateTokenomics } from './tokenomics-core.mjs';

const args = process.argv.slice(2);
const usage = 'Usage: node scripts/validate-contributor-grants.mjs <grants.json> [--tokenomics <proposal.json>] [--require-proposal]';
let file = null, tokenomicsFile = null, requireProposal = false, invalid = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tokenomics' && tokenomicsFile === null && i + 1 < args.length) {
    tokenomicsFile = args[++i];
  } else if (args[i] === '--require-proposal' && !requireProposal) {
    requireProposal = true;
  } else if (!args[i].startsWith('--') && file === null) {
    file = args[i];
  } else invalid = true;
}
if (!file || invalid || tokenomicsFile?.startsWith('--')) {
  console.error(usage);
  process.exitCode = 2;
} else {
  try {
    const grants = parseReviewJson(readSmallBytes(file));
    const tokenomics = tokenomicsFile === null ? null : parseReviewJson(readSmallBytes(tokenomicsFile));
    // Defense in depth: reject unsafe economics at the CLI boundary too.
    // The exported grant validator independently checks companions on drafts.
    const economicsCheck = tokenomics === null ? null : validateTokenomics(tokenomics);
    const report = economicsCheck !== null && !economicsCheck.valid
      ? { valid: false, errors: economicsCheck.errors.map(e => 'tokenomics.' + e) }
      : validateContributorGrants(grants, tokenomics, { requireProposal });
    if (!report.valid) {
      console.error('INVALID contributor grant plan (no payment authorization):');
      for (const error of report.errors) console.error(' - ' + error);
      process.exitCode = 1;
    } else {
      console.log(report.status.toUpperCase() + ' VALID for review only — NOT approved for issuance, vesting execution, distribution or AI-credit conversion.');
      if (report.proposedBaseUnits !== undefined) {
        console.log('Proposed base units: ' + report.proposedBaseUnits);
        console.log('Unassigned contributor bucket base units: ' + report.unassignedBucketBaseUnits);
      }
    }
  } catch (error) {
    console.error('Unable to read or parse local grant/tokenomics JSON: ' + error.message);
    process.exitCode = 2;
  }
}
