#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Tests execute with fake cast and forge; no RPC or token operations.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cat > "$work/cast" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' 'called' >> "$MOCK_CAST_LOG"
printf '421614\n'
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
pass=$((pass+1))
printf 'PASS: %d mocked RPC safety integration scenarios\n' "$pass"
