#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Reports checklist declarations only. Never authorizes token issuance or deployment.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSmallBytes } from './read-small-file.mjs';

const EXPECTED_TASKS = Object.freeze(Array.from({ length: 17 }, (_, i) =>
  `SC-${String(i + 1).padStart(2, '0')}`));
const EXPECTED_GATES = Object.freeze(['G1', 'G2', 'G3', 'G4', 'G5']);

/** Parse checklist syntax, never interpret a checkbox as independent evidence. */
export function summarizeLaunchReadiness(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0 || markdown.length > 1024 * 1024) {
    throw new Error('missing or oversized readiness document');
  }
  const tasks = new Map();
  const gates = new Set();
  for (const line of markdown.split(/\r?\n/u)) {
    if (/^\s*-\s*.*\*\*SC-\d+/u.test(line)) {
      const matched = /^\s*-\s*\[([ xX])\]\s+\*\*(SC-\d{2})\s*\//u.exec(line);
      if (!matched) throw new Error('malformed SC checklist entry');
      const id = matched[2];
      if (!EXPECTED_TASKS.includes(id) || tasks.has(id)) {
        throw new Error('unknown or repeated SC checklist ID');
      }
      tasks.set(id, matched[1].toLowerCase() === 'x');
    }
    if (/^\s*\|\s*G\d+\s*:/u.test(line)) {
      const matched = /^\s*\|\s*(G\d+)\s*:\s*[^|]+\|\s*[^|]+\|\s*[^|]+\|\s*$/u.exec(line);
      if (!matched || !EXPECTED_GATES.includes(matched[1]) || gates.has(matched[1])) {
        throw new Error('malformed, unknown or repeated decision gate');
      }
      gates.add(matched[1]);
    }
  }
  if (EXPECTED_TASKS.some(id => !tasks.has(id)) || gates.size !== EXPECTED_GATES.length) {
    throw new Error('incomplete launch checklist or decision gates');
  }
  if (Array.from(tasks.keys()).some((id, index) => id !== EXPECTED_TASKS[index])) {
    throw new Error('launch checklist IDs out of expected order');
  }
  const markedDoneTaskIds = EXPECTED_TASKS.filter(id => tasks.get(id));
  const openTaskIds = EXPECTED_TASKS.filter(id => !tasks.get(id));
  return {
    releaseStatus: 'NOT_AUTHORIZED',
    evidenceVerified: false,
    totalTasks: EXPECTED_TASKS.length,
    openCount: openTaskIds.length,
    markedDoneCount: markedDoneTaskIds.length,
    openTaskIds,
    markedDoneTaskIds,
    decisionGateCount: gates.size,
    warning: 'A checked box is a claim, not independent evidence or token launch approval.'
  };
}

function main() {
  if (process.argv.length !== 2) {
    console.error('Usage: node scripts/report-launch-readiness.mjs');
    process.exitCode = 2;
    return;
  }
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const bytes = readSmallBytes(resolve(root, 'docs/LAUNCH_READINESS.md'));
    const markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    console.log(JSON.stringify(summarizeLaunchReadiness(markdown), null, 2));
  } catch {
    console.error('Readiness report failed: invalid or unreadable checklist. No launch approval.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
