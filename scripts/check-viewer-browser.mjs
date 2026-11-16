#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Optional local-browser acceptance smoke test. No browser automation dependency,
// wallet, network API, RPC, signing or blockchain deployment.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWER_PATH = join(ROOT, 'demo', 'index.html');
const RESULT_ID = 'spica-browser-smoke-result';
// Fixed independent acceptance threshold for the keyboard-enabled DOM harness.
// Update only after reviewing every added or removed assertion.
const EXPECTED_ASSERTIONS = 112;

// Inline harness runs AFTER the viewer's own script, in an ephemeral COPY.
// Does not change or add a script to the shipped demo/index.html.
const HARNESS = String.raw`<script id="spica-browser-smoke-harness">
  (() => {
    "use strict";
    const failures = [];
    let assertions = 0;
    const byId = id => document.getElementById(id);
    const expect = (label, good) => {
      assertions++;
      if (!good) failures.push(label);
    };
    const snapshot = (a, b, allowance, stage, count) => {
      expect("Alice at stage " + stage, byId("alice-balance").textContent === a);
      expect("Bob at stage " + stage, byId("bob-balance").textContent === b);
      expect("Allowance at stage " + stage, byId("allowance").textContent === allowance);
      expect("Step counter " + stage, byId("progress").getAttribute("aria-valuenow") === String(stage));
      expect("Accessible phase label " + stage,
        byId("progress").getAttribute("aria-valuetext") ===
          "Fase " + stage + " di 6: " + byId("step-title").textContent);
      expect("Ledger count " + stage, byId("ledger").children.length === count);
      expect("Conservation at stage " + stage,
        byId("total-supply").textContent === "1.000 SPICA" &&
        byId("held-supply").textContent === "1.000 SPICA" &&
        byId("checks").textContent === "Coerente");
    };
    try {
      expect("Italian title", document.title.includes("SpicaCash"));
      expect("No network allowed by CSP",
        document.querySelector('meta[http-equiv="Content-Security-Policy"]')
          .content.includes("connect-src 'none'"));
      expect("Ledger does not trigger duplicate live announcements",
        byId("ledger").getAttribute("aria-live") === "off");
      snapshot("1.000", "0", "0", 1, 1);
      expect("Previous initially disabled", byId("previous").disabled);
      const steps = [
        ["875", "125", "0"],
        ["875", "125", "20"],
        ["882", "118", "13"],
        ["882", "118", "0"],
        ["882", "118", "0"]
      ];
      for (let index = 0; index < steps.length; index++) {
        byId("next").click();
        snapshot(...steps[index], index + 2, index + 2);
      }
      expect("Next disabled on last stage", byId("next").disabled);
      expect("Denied transfer marked", byId("ledger").lastElementChild.classList.contains("rejected"));
      byId("next").click();
      snapshot("882", "118", "0", 6, 6);
      byId("previous").click();
      snapshot("882", "118", "0", 5, 5);
      expect("Next reenabled after previous", !byId("next").disabled);
      byId("reset").click();
      snapshot("1.000", "0", "0", 1, 1);
      expect("Previous disabled after reset", byId("previous").disabled);
      const key = name => {
        const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
        document.dispatchEvent(event);
        expect("Keyboard " + name + " prevents page scrolling", event.defaultPrevented);
      };
      key("ArrowRight");
      snapshot("875", "125", "0", 2, 2);
      key("End");
      snapshot("882", "118", "0", 6, 6);
      key("ArrowRight");
      snapshot("882", "118", "0", 6, 6);
      key("Home");
      snapshot("1.000", "0", "0", 1, 1);
      key("ArrowLeft");
      snapshot("1.000", "0", "0", 1, 1);
      document.dispatchEvent(new KeyboardEvent("keydown",
        { key: "End", ctrlKey: true, bubbles: true, cancelable: true }));
      expect("Modified browser shortcut does not change stage",
        byId("progress").getAttribute("aria-valuenow") === "1");
    } catch (error) {
      failures.push("Browser exception: " + String(error));
    }
    const summary = {
      status: failures.length === 0 ? "PASS" : "FAIL",
      assertions,
      failures
    };
    const report = document.createElement("pre");
    report.id = "spica-browser-smoke-result";
    report.textContent = JSON.stringify(summary);
    document.body.append(report);
  })();
</script>`;

export function createSmokeHtml(html) {
  if (typeof html !== 'string' ||
      !html.includes('<script id="spica-local-logic">') ||
      !html.includes("connect-src 'none'") ||
      (html.match(/<\/body>/gi) || []).length !== 1 ||
      html.includes('spica-browser-smoke-harness') ||
      html.includes(RESULT_ID)) {
    throw new Error('Refusing to test an unexpected or already modified viewer document');
  }
  return html.replace(/<\/body>/i, HARNESS + '\n</body>');
}

export function parseSmokeOutput(dom) {
  if (typeof dom !== 'string') throw new TypeError('Browser DOM output must be text');
  const prefix = '<pre id="' + RESULT_ID + '">';
  const pos = dom.indexOf(prefix);
  if (pos < 0) throw new Error('Browser did not run the smoke-test harness');
  if (dom.indexOf(prefix, pos + prefix.length) !== -1) {
    throw new Error('Duplicate browser smoke-test results');
  }
  const end = dom.indexOf('</pre>', pos + prefix.length);
  if (end < 0) throw new Error('Browser smoke-test result was truncated');
  const value = JSON.parse(dom.slice(pos + prefix.length, end));
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== 3 ||
      !['status', 'assertions', 'failures'].every(key => Object.hasOwn(value, key)) ||
      !Number.isInteger(value.assertions) || value.assertions < 0 ||
      value.assertions > EXPECTED_ASSERTIONS ||
      !Array.isArray(value.failures) || value.failures.length > EXPECTED_ASSERTIONS ||
      !value.failures.every(x => typeof x === 'string' && x.length > 0 && x.length <= 200) ||
      !['PASS', 'FAIL'].includes(value.status) ||
      (value.status === 'PASS' &&
        (value.assertions !== EXPECTED_ASSERTIONS || value.failures.length !== 0)) ||
      (value.status === 'FAIL' && value.failures.length === 0)) {
    throw new Error('Malformed or incomplete browser smoke-test result');
  }
  return value;
}

export function browserCandidates(env = process.env) {
  const programDirs = [env.PROGRAMFILES, env['PROGRAMFILES(X86)']].filter(Boolean);
  const windowsPaths = programDirs.flatMap(dir => [
    join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ]);
  if (env.LOCALAPPDATA) {
    windowsPaths.push(join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  const defaults = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe']
    : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
  return [...new Set([env.SPICA_BROWSER_PATH, ...windowsPaths, ...defaults].filter(Boolean))];
}

function findBrowser() {
  const explicit = process.env.SPICA_BROWSER_PATH;
  if (explicit && !existsSync(explicit)) {
    throw new Error('SPICA_BROWSER_PATH does not point to an installed browser');
  }
  for (const candidate of browserCandidates()) {
    const result = spawnSync(candidate, ['--version'], {
      encoding: 'utf8', windowsHide: true, timeout: 3500
    });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error('Chrome/Chromium/Edge not found. Set SPICA_BROWSER_PATH to the installed browser executable.');
}

function main() {
  let temp;
  try {
    const browser = findBrowser();
    const html = readFileSync(VIEWER_PATH, 'utf8');
    temp = mkdtempSync(join(tmpdir(), 'spica-browser-'));
    const copy = join(temp, 'viewer-smoke.html');
    writeFileSync(copy, createSmokeHtml(html), { encoding: 'utf8', mode: 0o600 });
    const args = [
      '--headless=new', '--disable-gpu', '--disable-extensions',
      '--disable-background-networking', '--disable-sync',
      '--no-first-run', '--no-default-browser-check',
      '--no-proxy-server', '--user-data-dir=' + join(temp, 'profile'),
      '--virtual-time-budget=3000', '--dump-dom'
    ];
    // Only for restricted disposable environments. Never disable the browser's
    // sandbox by default on a developer workstation.
    if (process.env.SPICA_BROWSER_NO_SANDBOX === '1') args.push('--no-sandbox');
    args.push(pathToFileURL(copy).href);
    const result = spawnSync(browser, args, {
      encoding: 'utf8', windowsHide: true, timeout: 25000, maxBuffer: 2 * 1024 * 1024
    });
    if (result.error) throw new Error('Browser failed: ' + result.error.message);
    if (result.status !== 0) throw new Error('Browser exited unsuccessfully (code ' + result.status + ')');
    const report = parseSmokeOutput(result.stdout);
    if (report.status !== 'PASS') {
      throw new Error('Browser checks failed: ' + report.failures.join(' | '));
    }
    console.log('PASS: ' + report.assertions + ' real browser DOM assertions (offline viewer).');
    console.log('NOTE: this does not execute Solidity or validate a live blockchain.');
  } catch (error) {
    console.error('FAIL: ' + error.message);
    process.exitCode = 1;
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
