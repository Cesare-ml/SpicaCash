// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createSmokeHtml, parseSmokeOutput, browserCandidates
} from '../../scripts/check-viewer-browser.mjs';

const html = readFileSync(new URL('../../demo/index.html', import.meta.url), 'utf8');

test('injects an inline DOM acceptance harness after the real viewer script', () => {
  const instrumented = createSmokeHtml(html);
  assert.ok(instrumented.length > html.length);
  assert.equal(instrumented.split('spica-browser-smoke-harness').length - 1, 1);
  assert.ok(instrumented.indexOf('id="spica-local-logic"') <
    instrumented.indexOf('id="spica-browser-smoke-harness"'));
  assert.ok(instrumented.indexOf('id="spica-browser-smoke-harness"') <
    instrumented.lastIndexOf('</body>'));
  assert.match(instrumented, /"alice-balance"/);
  assert.match(instrumented, /"ledger"/);
  assert.match(instrumented, /"previous"/);
  assert.match(instrumented, /"next"/);
  assert.match(instrumented, /"reset"/);
  assert.match(instrumented, /"rejected"/);
  assert.match(instrumented, /"held-supply"/);
  assert.equal((html.match(/spica-browser-smoke-harness/g) || []).length, 0);
});

test('refuses unsafe or unexpected browser source rather than claiming success', () => {
  for (const source of [
    '', '<html><body></body></html>',
    '<script id="spica-local-logic"></script><body></body>',
    html.replace("connect-src 'none'", "connect-src *"),
    html.replace('</body>', '</body></body>'),
    createSmokeHtml(html)
  ]) {
    assert.throws(() => createSmokeHtml(source), /Refusing to test/);
  }
});

test('parses the strict real-browser success signal', () => {
  const dom = '<html><body><pre id="spica-browser-smoke-result">' +
    JSON.stringify({ status: 'PASS', assertions: 61, failures: [] }) +
    '</pre></body></html>';
  assert.deepEqual(parseSmokeOutput(dom),
    { status: 'PASS', assertions: 51, failures: [] });
});

test('preserves named assertion failures and refuses malformed evidence', () => {
  const failure = '<pre id="spica-browser-smoke-result">' +
    JSON.stringify({ status: 'FAIL', assertions: 51, failures: ['Bob final balance'] }) +
    '</pre>';
  assert.deepEqual(parseSmokeOutput(failure).failures, ['Bob final balance']);
  for (const dom of [
    '', '<html>Nothing executed</html>',
    '<pre id="spica-browser-smoke-result">bad json</pre>',
    '<pre id="spica-browser-smoke-result">' +
      JSON.stringify({ status: 'PASS', assertions: 2, failures: [] }) + '</pre>',
    '<pre id="spica-browser-smoke-result">' +
      JSON.stringify({ status: 'PASS', assertions: 60, failures: [] }) + '</pre>',
    '<pre id="spica-browser-smoke-result">' +
      JSON.stringify({ status: 'PASS', assertions: 62, failures: [] }) + '</pre>',
    '<pre id="spica-browser-smoke-result">' +
      JSON.stringify({ status: 'PASS', assertions: 51, failures: ['broken'] }) + '</pre>',
    '<pre id="spica-browser-smoke-result">' +
      JSON.stringify({ status: 'FAIL', assertions: 51, failures: [] }) + '</pre>',
    '<pre id="spica-browser-smoke-result">' +
      JSON.stringify({ status: 'PASS', assertions: 61, failures: [] })
  ]) {
    assert.throws(() => parseSmokeOutput(dom));
  }
});


test('rejects duplicate browser results even when the first looks successful', () => {
  const marker = '<pre id="spica-browser-smoke-result">' +
    JSON.stringify({ status: 'PASS', assertions: 61, failures: [] }) + '</pre>';
  assert.throws(() => parseSmokeOutput(marker + marker), /Duplicate browser smoke-test results/);
  assert.throws(() => parseSmokeOutput(marker +
    '<pre id="spica-browser-smoke-result">' +
    JSON.stringify({ status: 'FAIL', assertions: 20, failures: ['late DOM failure'] }) +
    '</pre>'), /Duplicate browser smoke-test results/);
});

test('preserves incomplete FAIL evidence for diagnostic output', () => {
  const marker = '<pre id="spica-browser-smoke-result">' +
    JSON.stringify({ status: 'FAIL', assertions: 20, failures: ['early exception'] }) +
    '</pre>';
  assert.deepEqual(parseSmokeOutput(marker),
    { status: 'FAIL', assertions: 20, failures: ['early exception'] });
});

test('discovers Windows browser installs and supports explicit overrides', () => {
  const env = {
    SPICA_BROWSER_PATH: 'C:\\Custom\\chrome.exe',
    PROGRAMFILES: 'C:\\Program Files',
    'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\demo\\AppData\\Local'
  };
  const choices = browserCandidates(env);
  assert.equal(choices[0], env.SPICA_BROWSER_PATH);
  assert.equal(choices.length, new Set(choices).size);
  assert.ok(choices.some(x => x.includes('Google')));
  assert.ok(choices.some(x => x.includes('Microsoft')));
});

test('running the optional browser script is not a dependency of offline Node tests', () => {
  // Importing the module exposes only pure planning/parsing helpers. It does
  // not launch a browser, and the GitHub-approved offline runner discovers
  // this extra *.test.mjs without a Chrome/Edge installation.
  assert.equal(typeof createSmokeHtml, 'function');
  assert.equal(typeof parseSmokeOutput, 'function');
  assert.equal(typeof browserCandidates, 'function');
});
