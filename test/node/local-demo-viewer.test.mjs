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
