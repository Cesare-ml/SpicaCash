#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Fail closed when Foundry does not report an actually exercised invariant campaign.
// This checks test-run output and selector metrics, not source, ABI or bytecode.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const requiredInvariants = [
  'invariant_TotalSupplyRemainsFixed',
  'invariant_TrackedBalancesConserveAllTokens',
  'invariant_NoTokensHeldByHandlerOrFixture',
];
const handlerContract = 'SpicaCashInvariantHandler';
const requiredSelectors = ['move', 'approve', 'pull'];
const requiredSmoke = [
  'testInvariantTargetsOnlyTheHandler',
  'testInvariantHandlerExercisesTransferApprovalAndPull',
];

export function checkInvariantEvidence(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2_000_000) {
    return { valid: false, errors: ['missing or oversized Forge output'] };
  }
  const report = raw.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
  const errors = [];
  // The selected Forge command should report exactly one suite with five tests.
  // Do not combine PASS markers from an unrelated or partial test run.
  const suites = [...report.matchAll(/^[ \t]*(?:Ran|Running)\s+(\d+)\s+tests?\s+for\s+(\S+)\s*$/gm)];
  const expectedSuite = 'test/SpicaCashInvariant.t.sol:SpicaCashInvariantTest';
  if (!suites.some((suite) => suite[2] === expectedSuite)) {
    errors.push('SpicaCashInvariantTest suite header missing');
  }
  if (suites.length !== 1) errors.push('expected exactly one Foundry test suite');
  if (suites.length === 1 && suites[0][2] === expectedSuite && suites[0][1] !== '5') {
    errors.push('expected exactly five tests in SpicaCashInvariantTest');
  }
  if (/^\s*\[FAIL\]/m.test(report)) errors.push('Forge output includes failing tests');

  // Match a complete summary line, including skipped-test accounting. An
  // unrelated "ok" summary, extra suite or incomplete run must never pass.
  const summaryLines = [...report.matchAll(/^[ \t]*(?:Suite|Test) result:[^\n]*$/gm)];
  const summary = summaryLines.length === 1
    ? /^[ \t]*(?:Suite|Test) result:\s*ok\.\s*(\d+)\s+passed;\s*(\d+)\s+failed(?:;\s*(\d+)\s+skipped)?(?:;\s*finished\b.*)?\s*$/.exec(summaryLines[0][0])
    : null;
  if (!summary || summary[1] !== '5' || summary[2] !== '0' ||
      (summary[3] !== undefined && summary[3] !== '0')) {
    errors.push('success summary with exactly five passed and zero failed/skipped tests missing');
  }

  const scopedReport = suites.length === 1 && summaryLines.length === 1 &&
    suites[0].index < summaryLines[0].index
    ? report.slice(suites[0].index, summaryLines[0].index)
    : '';
  if ((report.match(/^[ \t]*\[PASS\]/gm) || []).length !== 5) {
    errors.push('expected exactly five passing markers in full Forge output');
  }
  if ((scopedReport.match(/^\s*\[PASS\]/gm) || []).length !== 5) {
    errors.push('expected exactly five passing markers inside the selected suite');
  }

  for (const name of requiredSmoke) {
    const pattern = new RegExp(`^\\s*\\[PASS\\]\\s+${name}\\(\\)`, 'gm');
    const matches = [...scopedReport.matchAll(pattern)];
    if (matches.length !== 1) errors.push(`${name}: expected exactly one passing result`);
  }
  // Foundry `show_metrics = true` renders a pipe-delimited selector table
  // immediately below each invariant result. We bind each table to *its own*
  // campaign, rather than accepting plausible counts from other tests.
  const parseMetricsCells = (line) => {
    const trimmed = line.trim();
    if (!/^[|│]/u.test(trimmed) || !/[|│]$/u.test(trimmed)) return null;
    return trimmed.slice(1, -1).split(/[|│]/u).map((cell) => cell.trim());
  };
  const passLines = [...scopedReport.matchAll(/^\s*\[PASS\][^\n]*/gm)];

  for (const name of requiredInvariants) {
    const pattern = new RegExp(
      `^\\s*\\[PASS\\]\\s+${name}\\(\\)\\s+\\(runs:\\s*(\\d+),\\s*calls:\\s*(\\d+),\\s*reverts:\\s*(\\d+)\\)`,
      'gm'
    );
    const matches = [...scopedReport.matchAll(pattern)];
    if (matches.length !== 1) {
      errors.push(`${name}: expected exactly one passing invariant campaign with metrics`);
      continue;
    }
    const [runs, calls, reverts] = matches[0].slice(1).map(BigInt);
    if (runs < 64n) errors.push(`${name}: fewer than 64 invariant runs`);
    if (calls < 4096n) errors.push(`${name}: fewer than 4096 invariant calls`);
    if (reverts !== 0n) errors.push(`${name}: nonzero revert count`);

    const sectionStart = matches[0].index + matches[0][0].length;
    const nextPass = passLines.find((line) => line.index > matches[0].index);
    const sectionEnd = nextPass ? nextPass.index : scopedReport.length;
    const section = scopedReport.slice(sectionStart, sectionEnd);
    const rows = section.split('\n').map(parseMetricsCells).filter(Boolean);
    const headers = rows.filter((row) => row.join(',') === 'Contract,Selector,Calls,Reverts,Discards');
    if (headers.length !== 1) {
      errors.push(`${name}: expected exactly one Foundry selector metrics table`);
      continue;
    }
    const data = rows.filter((row) => row.join(',') !== 'Contract,Selector,Calls,Reverts,Discards');
    // No extra target functions/rows: expected only the three bounded handlers.
    if (data.length !== requiredSelectors.length) {
      errors.push(`${name}: expected exactly three handler selector metric rows`);
    }
    const entries = new Map();
    let summedCalls = 0n;
    for (const row of data) {
      if (row.length !== 5 || row[0] !== handlerContract ||
          !requiredSelectors.includes(row[1]) || entries.has(row[1]) ||
          !row.slice(2).every((value) => /^\d+$/.test(value))) {
        errors.push(`${name}: unexpected or malformed handler selector metrics row`);
        continue;
      }
      const [callsPerSelector, selectorReverts, discards] = row.slice(2).map(BigInt);
      entries.set(row[1], callsPerSelector);
      summedCalls += callsPerSelector;
      if (callsPerSelector === 0n) errors.push(`${name}: ${row[1]} selector was never called`);
      if (selectorReverts !== 0n) errors.push(`${name}: ${row[1]} selector reverted`);
      if (discards !== 0n) errors.push(`${name}: ${row[1]} selector discarded calls`);
    }
    for (const selector of requiredSelectors) {
      if (!entries.has(selector)) errors.push(`${name}: ${selector} selector metrics missing`);
    }
    if (summedCalls !== calls) {
      errors.push(`${name}: selector calls do not sum to campaign calls`);
    }
  }
  return { valid: errors.length === 0, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) {
    console.error('Usage: node scripts/check-foundry-invariants.mjs <forge-test-output-file>');
    process.exitCode = 2;
  } else {
    try {
      const result = checkInvariantEvidence(readFileSync(path, 'utf8'));
      if (!result.valid) {
        for (const problem of result.errors) console.error(`Invariant evidence failed: ${problem}`);
        process.exitCode = 1;
      } else {
        console.log('PASS: 3 invariant campaigns, each with 64+ runs, 4096+ calls, 3 exercised handlers and zero reverts/discards; 2 smoke tests');
      }
    } catch {
      // Do not echo file paths or error payloads, which could contain sensitive data.
      console.error('Invariant evidence failed: cannot read Forge output');
      process.exitCode = 1;
    }
  }
}
