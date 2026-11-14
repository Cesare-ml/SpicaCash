#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Tests execute with fake cast and forge; no RPC or token operations.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cat > "$work/cast" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$MOCK_CAST_LOG"
[[ "$ETH_RPC_URL" == "$ARBITRUM_SEPOLIA_RPC_URL" ]] || exit 70
if [[ "${MOCK_CAST_ERROR:-}" == 'YES' ]]; then
  printf 'provider failed at %s\n' "$ETH_RPC_URL" >&2
  exit 69
fi
printf '%s\n' "${MOCK_CHAIN_ID:-421614}"
MOCK
cat > "$work/forge" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$MOCK_FORGE_LOG"
MOCK
chmod +x "$work/cast" "$work/forge"
export PATH="$work:$PATH"
export MOCK_CAST_LOG="$work/cast.log" MOCK_FORGE_LOG="$work/forge.log"
export SPICA_TESTNET_HOLDER="0x000000000000000000000000000000000000BEEF"
export SPICA_TESTNET_SUPPLY_BASE_UNITS="1"
unset SPICA_CONFIRM_TESTNET_DEPLOY FOUNDRY_ACCOUNT 2>/dev/null || true
pass=0
reject_before_cast() {
  : > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
  if bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1; then
    cat "$work/out" >&2
    echo "FAIL: unsafe RPC accepted" >&2
    exit 1
  fi
  grep -q 'REFUSED: unsafe testnet RPC endpoint' "$work/out"
  [[ ! -s "$MOCK_CAST_LOG" && ! -s "$MOCK_FORGE_LOG" ]] || { echo 'FAIL: attempted RPC/forge' >&2; exit 1; }
  if grep -q 'SECRET_VALUE' "$work/out"; then echo 'FAIL: secret disclosed in output' >&2; exit 1; fi
  pass=$((pass+1))
}
export ARBITRUM_SEPOLIA_RPC_URL='http://rpc.example.test'
reject_before_cast
export ARBITRUM_SEPOLIA_RPC_URL='https://alice:SECRET_VALUE@rpc.example.test'
reject_before_cast
export ARBITRUM_SEPOLIA_RPC_URL='https://rpc.example.test/#SECRET_VALUE'
reject_before_cast
export ARBITRUM_SEPOLIA_RPC_URL='https://rpc.example.test\@bad.example.test'
reject_before_cast
export ARBITRUM_SEPOLIA_RPC_URL='https://rpc.example.test/SECRET_VALUE?apiKey=SECRET_VALUE'
: > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1
[[ $(wc -l < "$MOCK_CAST_LOG") -eq 1 && ! -s "$MOCK_FORGE_LOG" ]]
grep -q 'No transaction broadcast' "$work/out"
if grep -q 'SECRET_VALUE' "$work/out"; then echo 'FAIL: secret disclosed in output' >&2; exit 1; fi
if grep -q 'SECRET_VALUE' "$MOCK_CAST_LOG"; then echo 'FAIL: provider token in cast arguments' >&2; exit 1; fi
pass=$((pass+1))

# A failing provider must not leak URLs in the script's stderr output.
export MOCK_CAST_ERROR='YES'
: > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
if bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1; then
  echo 'FAIL: failed RPC was accepted' >&2; exit 1
fi
grep -q 'provider details suppressed' "$work/out"
if grep -q 'SECRET_VALUE' "$work/out"; then echo 'FAIL: provider token in cast error' >&2; exit 1; fi
[[ ! -s "$MOCK_FORGE_LOG" ]] || { echo 'FAIL: forge ran after cast failure' >&2; exit 1; }
pass=$((pass+1))
unset MOCK_CAST_ERROR

# Do not echo an unexpected chain-id payload: a faulty RPC may include a token.
export MOCK_CHAIN_ID='wrong-chain-SECRET_VALUE'
: > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
if bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1; then
  echo 'FAIL: unexpected chain ID was accepted' >&2; exit 1
fi
grep -q 'chain ID mismatch' "$work/out"
if grep -q 'SECRET_VALUE' "$work/out"; then echo 'FAIL: chain ID payload leaked to output' >&2; exit 1; fi
[[ ! -s "$MOCK_FORGE_LOG" ]] || { echo 'FAIL: forge ran after chain mismatch' >&2; exit 1; }
pass=$((pass+1))
unset MOCK_CHAIN_ID

# Even an explicitly authorized MOCK broadcast must not pass an RPC token via argv.
export SPICA_CONFIRM_TESTNET_DEPLOY='YES_ARBITRUM_SEPOLIA_ONLY'
export FOUNDRY_ACCOUNT='synthetic-test-account'
: > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1
[[ $(wc -l < "$MOCK_CAST_LOG") -eq 1 && $(wc -l < "$MOCK_FORGE_LOG") -eq 1 ]]
grep -q -- '--broadcast' "$MOCK_FORGE_LOG"
if grep -q 'SECRET_VALUE' "$MOCK_CAST_LOG" || grep -q 'SECRET_VALUE' "$MOCK_FORGE_LOG" || grep -q 'SECRET_VALUE' "$work/out"; then
  echo 'FAIL: provider token leaked to mocked CLI argv or output' >&2; exit 1
fi
pass=$((pass+1))
printf 'PASS: %d mocked RPC safety integration scenarios\n' "$pass"
