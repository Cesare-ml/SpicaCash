#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Validates a proposed allocation plan; cannot deploy, sign, mint or approve one.
import { readFileSync } from 'node:fs';
import { validateTokenomics } from './tokenomics-core.mjs';

const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--require-proposal')) {
  console.error('Usage: node scripts/validate-tokenomics.mjs <plan.json> [--require-proposal]');
  process.exitCode = 2;
} else {
  try {
    const plan = JSON.parse(readFileSync(args[0], 'utf8'));
    const report = validateTokenomics(plan, { requireProposal: args[1] === '--require-proposal' });
    if (!report.valid) {
      console.error('INVALID tokenomics plan (never deployment approval):');
      for (const error of report.errors) console.error(' - ' + error);
      process.exitCode = 1;
    } else {
      console.log(
        report.status.toUpperCase() +
        ' VALID for documentation only — NOT approved for deployment, sale, treasury transfers or distribution.'
      );
    }
  } catch (error) {
    console.error('Unable to read or parse tokenomics JSON: ' + error.message);
    process.exitCode = 2;
  }
}
