// SPDX-License-Identifier: MIT
// Strict, offline JSON decoding for human-reviewed, SHA-256-pinned documents.
// Reject ambiguous duplicate object keys before JSON.parse discards them.
import { TextDecoder } from 'node:util';

const MAX_NESTING = 128;
const whitespace = /[\x20\t\n\r]/;

/** Decode UTF-8 without silently replacing malformed byte sequences. */
export function parseReviewJson(bytes) {
  // TextDecoder normally strips an initial UTF-8 BOM. JSON.parse of the raw
  // UTF-8 text rejects it, so preserve that strict review-file contract.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new SyntaxError('UTF-8 BOM is not permitted in review JSON');
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let i = 0;
  const skip = () => { while (i < text.length && whitespace.test(text[i])) i++; };

  function stringToken() {
    if (text[i] !== '"') throw new SyntaxError('expected JSON string');
    const begin = i++;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i++] === '"') return text.slice(begin, i);
    }
    throw new SyntaxError('unterminated JSON string');
  }

  function value(depth) {
    if (depth > MAX_NESTING) throw new SyntaxError('JSON nesting limit exceeded');
    skip();
    if (text[i] === '"') { stringToken(); return; }
    if (text[i] === '{') {
      i++; skip();
      const keys = new Set();
      if (text[i] === '}') { i++; return; }
      while (true) {
        skip();
        const key = JSON.parse(stringToken()); // canonicalizes escaped keys
        if (keys.has(key)) throw new SyntaxError('duplicate JSON object key');
        keys.add(key);
        skip();
        if (text[i++] !== ':') throw new SyntaxError('expected JSON colon');
        value(depth + 1);
        skip();
        const delimiter = text[i++];
        if (delimiter === '}') return;
        if (delimiter !== ',') throw new SyntaxError('expected JSON object separator');
      }
    }
    if (text[i] === '[') {
      i++; skip();
      if (text[i] === ']') { i++; return; }
      while (true) {
        value(depth + 1);
        skip();
        const delimiter = text[i++];
        if (delimiter === ']') return;
        if (delimiter !== ',') throw new SyntaxError('expected JSON array separator');
      }
    }
    // JSON.parse below checks exact primitive syntax and rejects extra tokens.
    const begin = i;
    while (i < text.length && !/[,}\]\x20\t\r\n]/.test(text[i])) i++;
    if (i === begin) throw new SyntaxError('expected JSON value');
  }

  value(0);
  skip();
  if (i !== text.length) throw new SyntaxError('unexpected trailing JSON data');
  return JSON.parse(text);
}
