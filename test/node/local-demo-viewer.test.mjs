// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../../demo/index.html', import.meta.url), 'utf8');
const embedded = html.match(/<script id="spica-local-logic">([\s\S]*?)<\/script>/);
assert.ok(embedded, 'the static browser viewer contains its inline scenario engine');

// Execute the exact browser script without a DOM or any network access.
const scope = {};
runInNewContext(embedded[1] + '\n;globalThis.demoForTests = { calculate, formatTokens, SCENARIO, UNIT, TOTAL };',
  scope, { timeout: 1000, filename: 'demo/index.html' });
const { calculate, formatTokens, SCENARIO, UNIT, TOTAL } = scope.demoForTests;

test('all six deterministic stages preserve the immutable 1,000-token supply', () => {
  assert.equal(SCENARIO.length, 6);
  for (let i = 0; i < SCENARIO.length; i++) {
    const state = calculate(i);
    assert.equal(state.alice + state.bob, TOTAL);
    assert.equal(state.total, TOTAL);
    assert.ok(state.alice >= 0n && state.bob >= 0n && state.allowance >= 0n);
    assert.equal(state.history.length, i + 1);
  }
});

test('mint and transfer match the independent Solidity local-demo fixture', () => {
  const initial = calculate(0);
  assert.equal(initial.alice, 1000n * UNIT);
  assert.equal(initial.bob, 0n);
  const transferred = calculate(1);
  assert.equal(transferred.alice, 875n * UNIT);
  assert.equal(transferred.bob, 125n * UNIT);
});

test('approval and delegated transfer consume exactly seven of twenty units', () => {
  const approved = calculate(2);
  assert.equal(approved.alice, 875n * UNIT);
  assert.equal(approved.bob, 125n * UNIT);
  assert.equal(approved.allowance, 20n * UNIT);
  const pulled = calculate(3);
  assert.equal(pulled.alice, 882n * UNIT);
  assert.equal(pulled.bob, 118n * UNIT);
  assert.equal(pulled.allowance, 13n * UNIT);
});

test('revoked approval blocks further spending without mutating either balance', () => {
  const revoked = calculate(4);
  const rejected = calculate(5);
  assert.equal(revoked.allowance, 0n);
  assert.equal(rejected.allowance, 0n);
  assert.equal(rejected.alice, revoked.alice);
  assert.equal(rejected.bob, revoked.bob);
  assert.equal(rejected.history[5].rejected, true);
});

test('step calculation is stateless and rejects invalid indices', () => {
  assert.equal(calculate(5).alice, 882n * UNIT);
  assert.equal(calculate(1).bob, 125n * UNIT);
  for (const bad of [-1, 6, 1.5, NaN, '2', null]) {
    assert.throws(() => calculate(bad), /Fase non valida/);
  }
});

test('viewer uses 18-decimal units for human-readable token display', () => {
  assert.equal(formatTokens(1n * UNIT), '1');
  assert.equal(formatTokens(125n * UNIT), '125');
  assert.equal(formatTokens(1000n * UNIT), '1.000');
  assert.equal(formatTokens(1n * UNIT + 1n), '1,000000000000000001');
  assert.equal(formatTokens(0n), '0');
});

test('single-file browser viewer has no external code, form, wallet or RPC surface', () => {
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /<button type="button" id="next"/);
  assert.match(html, /<button type="button" id="reset"/);
  assert.doesNotMatch(html, /<script\s+src|<iframe|<form\b|<link\s+[^>]*href|https?:\/\//i);
  assert.doesNotMatch(embedded[1], /\bfetch\s*\(|\bWebSocket\s*\(|\bXMLHttpRequest\b|\bwindow\.ethereum\b|\bcast\s+send\b/);
});

test('stage changes are announced to assistive technology and keyboard controls are documented', () => {
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /Tastiera:.*Home.*End/);
  assert.match(embedded[1], /document\.addEventListener\("keydown"/);
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    assert.ok(embedded[1].includes('event.key === "' + key + '"'));
  }
  assert.match(embedded[1], /event\.preventDefault\(\)/);
  assert.match(embedded[1], /event\.ctrlKey/);
  assert.match(embedded[1], /isContentEditable/);
});

function makeViewerElement(tagName = 'DIV') {
  const attributes = new Map();
  const handlers = new Map();
  return {
    tagName, textContent: '', className: '', disabled: false,
    isContentEditable: false, style: {}, children: [],
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    addEventListener(type, handler) {
      const list = handlers.get(type) || [];
      list.push(handler);
      handlers.set(type, list);
    },
    click() { for (const handler of handlers.get('click') || []) handler(); },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; }
  };
}

function mountOfflineViewer() {
  const ids = [
    'alice-balance', 'bob-balance', 'allowance', 'total-supply',
    'held-supply', 'checks', 'step-title', 'step-detail',
    'progress-text', 'progress', 'progress-fill', 'previous',
    'next', 'reset', 'ledger'
  ];
  const elements = new Map(ids.map(id => [id, makeViewerElement()]));
  const events = new Map();
  const document = {
    getElementById(id) {
      assert.ok(elements.has(id), 'missing test fixture element: ' + id);
      return elements.get(id);
    },
    createElement(tagName) { return makeViewerElement(tagName.toUpperCase()); },
    addEventListener(type, handler) {
      const list = events.get(type) || [];
      list.push(handler);
      events.set(type, list);
    }
  };
  // Run the *shipped inline script*, including render and keyboard listeners,
  // with only a local fake DOM. No browser, network, timers or wallet access.
  runInNewContext(embedded[1], { document }, {
    timeout: 1000, filename: 'demo/index.html'
  });
  const byId = id => elements.get(id);
  return {
    byId,
    stage: () => Number(byId('progress').getAttribute('aria-valuenow')),
    key(key, options = {}) {
      let prevented = false;
      const event = {
        key, target: document, altKey: false, ctrlKey: false,
        shiftKey: false, metaKey: false, ...options,
        preventDefault() { prevented = true; }
      };
      for (const handler of events.get('keydown') || []) handler(event);
      return prevented;
    }
  };
}

test('actual inline keyboard listener navigates six bounded replay states', () => {
  const app = mountOfflineViewer();
  assert.equal(app.stage(), 1);
  assert.equal(app.key('ArrowRight'), true);
  assert.equal(app.stage(), 2);
  assert.equal(app.byId('alice-balance').textContent, '875');
  assert.equal(app.byId('bob-balance').textContent, '125');
  assert.equal(app.key('End'), true);
  assert.equal(app.stage(), 6);
  assert.equal(app.byId('alice-balance').textContent, '882');
  assert.equal(app.byId('bob-balance').textContent, '118');
  assert.equal(app.byId('allowance').textContent, '0');
  assert.equal(app.byId('ledger').children.length, 6);
  assert.equal(app.key('ArrowRight'), true);
  assert.equal(app.stage(), 6, 'right arrow must not leave final stage');
  assert.equal(app.key('Home'), true);
  assert.equal(app.stage(), 1);
  assert.equal(app.key('ArrowLeft'), true);
  assert.equal(app.stage(), 1, 'left arrow must not precede first stage');
  assert.equal(app.byId('total-supply').textContent, '1.000 SPICA');
  assert.equal(app.byId('held-supply').textContent, '1.000 SPICA');
});

test('keyboard listener preserves modifiers, editable controls, and unrelated keys', () => {
  const app = mountOfflineViewer();
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
    assert.equal(app.key('End', { [modifier]: true }), false, modifier);
    assert.equal(app.stage(), 1, modifier);
  }
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(app.key('End', { target: { tagName } }), false, tagName);
    assert.equal(app.stage(), 1, tagName);
  }
  assert.equal(app.key('End', { target: { tagName: 'DIV', isContentEditable: true } }), false);
  assert.equal(app.stage(), 1);
  assert.equal(app.key('Escape'), false);
  assert.equal(app.stage(), 1);
  assert.equal(app.key('End'), true);
  assert.equal(app.stage(), 6);
});

test('mouse controls still work after keyboard navigation and reset', () => {
  const app = mountOfflineViewer();
  app.key('End');
  assert.equal(app.byId('next').disabled, true);
  app.byId('previous').click();
  assert.equal(app.stage(), 5);
  assert.equal(app.byId('next').disabled, false);
  app.byId('reset').click();
  assert.equal(app.stage(), 1);
  assert.equal(app.byId('previous').disabled, true);
  app.byId('next').click();
  assert.equal(app.stage(), 2);
  assert.equal(app.byId('ledger').children.length, 2);
  assert.equal(app.byId('held-supply').textContent, '1.000 SPICA');
});
