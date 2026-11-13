// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewJson } from '../../scripts/parse-review-json.mjs';

const parse = (text) => parseReviewJson(Buffer.from(text));

test('valid object and nested arrays decode normally', () => {
  assert.deepEqual(parse('{"a":1,"list":[{"a":2},true,null,"x"]}'),
    {a:1,list:[{a:2},true,null,'x']});
});
test('same field name in separate objects is allowed', () => {
  assert.deepEqual(parse('[{"status":"draft"},{"status":"proposal"}]'),
    [{status:'draft'},{status:'proposal'}]);
});
test('rejects duplicate top-level object keys', () => {
  assert.throws(() => parse('{"status":"draft","status":"proposal"}'), /duplicate JSON object key/);
});
test('rejects duplicate nested object keys', () => {
  assert.throws(() => parse('{"a":[{"x":1,"x":2}]}'), /duplicate JSON object key/);
});
test('detects equivalent escaped and plain keys', () => {
  assert.throws(() => parse('{"status":1,"\\u0073tatus":2}'), /duplicate JSON object key/);
});
test('does not mistake escaped quotes, commas or braces inside strings for structure', () => {
  assert.deepEqual(parse('{"x":"\\\" , } [ : ","y":"{a,b}"}'), {x:'" , } [ : ',y:'{a,b}'});
});
test('rejects UTF-8 BOM instead of silently stripping bytes', () => {
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"status":"draft"}')]);
  assert.throws(() => parseReviewJson(bytes), /UTF-8 BOM is not permitted/);
});
test('allows U+FEFF as actual JSON string content, not as a leading BOM', () => {
  assert.deepEqual(parseReviewJson(Buffer.from(JSON.stringify({text:'\uFEFF'}))), {text:'\uFEFF'});
});
test('rejects invalid UTF-8 rather than accepting replacement glyphs', () => {
  assert.throws(() => parseReviewJson(Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xff,0x22,0x7d])), /encoded|UTF-8|valid/i);
});
test('rejects malformed JSON syntax', () => {
  for(const input of ['{', '{"x":}', '{"x":1,}', '[1,]', '{} {}']) {
    assert.throws(() => parse(input), SyntaxError, input);
  }
});
test('rejects a lone high surrogate in a JSON field name', () => {
  assert.throws(() => parse(String.raw`{"\uD800":1}`), /unpaired UTF-16 surrogate/);
});
test('rejects a lone low surrogate in a JSON field value', () => {
  assert.throws(() => parse(String.raw`{"memo":"\uDC00"}`), /unpaired UTF-16 surrogate/);
});
test('rejects a high surrogate not immediately followed by a low one', () => {
  assert.throws(() => parse(String.raw`{"memo":"\uD83Dhello\uDE00"}`), /unpaired UTF-16 surrogate/);
});
test('accepts correctly paired escaped surrogates and literal Unicode', () => {
  assert.deepEqual(parse(String.raw`{"emoji":"\uD83D\uDE00"}`), {emoji:'😀'});
  assert.deepEqual(parse('{"emoji":"😀"}'), {emoji:'😀'});
});
test('detects duplicate Unicode-equivalent keys across escape and UTF-8 forms', () => {
  assert.throws(() => parse(String.raw`{"\uD83D\uDE00":1,"😀":2}`), /duplicate JSON object key/);
});
test('rejects dangerous depth before stack overflow', () => {
  assert.throws(() => parse('['.repeat(130)+'0'+']'.repeat(130)), /nesting limit exceeded/);
});
test('empty and scalar JSON syntax still handled', () => {
  assert.deepEqual(parse('{}'), {});
  assert.deepEqual(parse('[]'), []);
  assert.equal(parse('42'), 42);
  assert.equal(parse('null'), null);
});
