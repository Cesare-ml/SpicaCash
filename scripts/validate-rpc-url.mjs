#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Local syntax-only endpoint guard; NEVER contacts the RPC or prints its URL.
// A syntactically valid URL does NOT prove the server is trustworthy.

const raw = process.env.ARBITRUM_SEPOLIA_RPC_URL;
const refuse = (reason) => {
  console.error(`REFUSED: unsafe testnet RPC endpoint (${reason}).`);
  process.exitCode = 1;
};

if (typeof raw !== 'string' || raw.length < 9 || raw.length > 2048) {
  refuse('missing URL or invalid length');
} else if (raw !== raw.trim() || /[\s\\\x00-\x1f\x7f]/u.test(raw)) {
  refuse('whitespace or backslash');
} else {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    refuse('malformed URL');
  }
  if (parsed) {
    if (!raw.startsWith('https://') || parsed.protocol !== 'https:' || !parsed.hostname) {
      refuse('HTTPS required');
    } else if (parsed.username || parsed.password) {
      refuse('embedded URL credentials are not permitted');
    } else if (raw.includes('#') || parsed.hash) {
      refuse('URL fragments are not permitted');
    } else if (!/^https:\/\/[A-Za-z0-9.:[\]-]+(?:[/?]|$)/u.test(raw)) {
      refuse('noncanonical endpoint authority');
    }
  }
}
