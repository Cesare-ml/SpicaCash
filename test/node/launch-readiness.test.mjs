// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { summarizeLaunchReadiness } from '../../scripts/report-launch-readiness.mjs';

const reportScript = fileURLToPath(new URL('../../scripts/report-launch-readiness.mjs', import.meta.url));

const task = (index, checked = false) =>
  `- [${checked ? 'x' : ' '}] **SC-${String(index).padStart(2, '0')} / sample task.** Example`;
const gate = index => `| G${index}: sample | Independent review required | **Not completed** |`;
const fixture = (checked = []) => [
  '# Non-authorizing research checklist',
  ...Array.from({ length: 17 }, (_, i) => task(i + 1, checked.includes(i + 1))),
  ...Array.from({ length: 5 }, (_, i) => gate(i + 1))
].join('\n');

test('parses the 17 open tasks and 5 gates without granting release', () => {
  const report = summarizeLaunchReadiness(fixture());
  assert.equal(report.releaseStatus, 'NOT_AUTHORIZED');
  assert.equal(report.evidenceVerified, false);
  assert.equal(report.totalTasks, 17);
  assert.equal(report.openCount, 17);
  assert.equal(report.markedDoneCount, 0);
  assert.equal(report.decisionGateCount, 5);
  assert.equal(report.openTaskIds.at(0), 'SC-01');
  assert.equal(report.openTaskIds.at(-1), 'SC-17');
});

test('checked entries are claims only, never launch authorization', () => {
  const partiallyChecked = summarizeLaunchReadiness(fixture([2, 7]));
  assert.deepEqual(partiallyChecked.markedDoneTaskIds, ['SC-02', 'SC-07']);
  assert.equal(partiallyChecked.openCount, 15);
  const all = summarizeLaunchReadiness(fixture(Array.from({ length: 17 }, (_, i) => i + 1)));
  assert.equal(all.openCount, 0);
  assert.equal(all.releaseStatus, 'NOT_AUTHORIZED');
  assert.equal(all.evidenceVerified, false);
});

test('refuses missing or repeated SC IDs', () => {
  assert.throws(() => summarizeLaunchReadiness(fixture().replace(task(1) + '\n', '')),
    /incomplete/);
  assert.throws(() => summarizeLaunchReadiness(fixture() + '\n' + task(1)),
    /unknown or repeated/);
  assert.throws(() => summarizeLaunchReadiness(fixture().replace(task(17), task(18))),
    /unknown or repeated/);
});

test('refuses malformed checkbox marks, omitted boxes and altered ordering', () => {
  assert.throws(() => summarizeLaunchReadiness(fixture().replace(task(1), task(1).replace('[ ]', '[?]'))),
    /malformed SC/);
  assert.throws(() => summarizeLaunchReadiness(fixture().replace(task(1), task(1).replace('[ ] ', ''))),
    /malformed SC/);
  const lines = fixture().split('\n');
  [lines[1], lines[2]] = [lines[2], lines[1]];
  assert.throws(() => summarizeLaunchReadiness(lines.join('\n')), /out of expected order/);
});

test('refuses missing, repeated and unknown decision gates', () => {
  assert.throws(() => summarizeLaunchReadiness(fixture().replace('\n' + gate(5), '')),
    /incomplete/);
  assert.throws(() => summarizeLaunchReadiness(fixture() + '\n' + gate(1)),
    /repeated/);
  assert.throws(() => summarizeLaunchReadiness(fixture() + '\n' + gate(6)),
    /unknown/);
});

test('refuses blank, non-string and oversized documents', () => {
  for (const input of ['', null, 42, 'x'.repeat(1024 * 1024 + 1)]) {
    assert.throws(() => summarizeLaunchReadiness(input), /missing or oversized/);
  }
});

test('the actual current readiness roadmap follows the reviewed ID inventory', () => {
  const markdown = readFileSync(new URL('../../docs/LAUNCH_READINESS.md', import.meta.url), 'utf8');
  const report = summarizeLaunchReadiness(markdown);
  assert.equal(report.totalTasks, 17);
  assert.equal(report.decisionGateCount, 5);
  assert.equal(report.releaseStatus, 'NOT_AUTHORIZED');
});

test('CLI emits valid JSON but never implies launch authorization', () => {
  const result = spawnSync(process.execPath, [reportScript], {
    encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.releaseStatus, 'NOT_AUTHORIZED');
  assert.equal(report.evidenceVerified, false);
  assert.equal(report.totalTasks, 17);
});

test('CLI rejects additional arguments without reading or authorizing anything', () => {
  const result = spawnSync(process.execPath, [reportScript, 'unexpected'], {
    encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' }
  });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Usage: node scripts\/report-launch-readiness\.mjs/);
});
