#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Offline safety tests for the guarded Arbitrum Sepolia helper (no real RPC or keys).
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
deploy_script="$project_root/scripts/deploy-arbitrum-sepolia.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cat > "$work/cast" <<'MOCK'
#!/usr/bin/env bash
[[ "${1:-}" == "chain-id" ]] || exit 70
printf '%s\n' "${MOCK_CHAIN_ID:?mock chain id missing}"
MOCK

cat > "$work/forge" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${MOCK_FORGE_LOG:?mock log missing}"
MOCK
chmod +x "$work/cast" "$work/forge"

export PATH="$work:$PATH"
export ARBITRUM_SEPOLIA_RPC_URL="https://invalid.example.test/rpc"
export SPICA_TESTNET_HOLDER="0x000000000000000000000000000000000000BEEF"
export SPICA_TESTNET_SUPPLY_BASE_UNITS="1000000000000000000"
export MOCK_FORGE_LOG="$work/broadcasts"
export MOCK_CHAIN_ID=421614
unset FOUNDRY_ACCOUNT SPICA_CONFIRM_TESTNET_DEPLOY 2>/dev/null || true

pass=0
assert_no_broadcast() {
  if [[ -s "$MOCK_FORGE_LOG" ]]; then
    printf 'FAIL: unexpected forge broadcast attempt\n' >&2
    cat "$MOCK_FORGE_LOG" >&2
    exit 1
  fi
}
expect_success() {
  : > "$MOCK_FORGE_LOG"
  if ! bash "$deploy_script" > "$work/output" 2>&1; then
    cat "$work/output" >&2
    printf 'FAIL: expected preflight success\n' >&2
    exit 1
  fi
  assert_no_broadcast
  pass=$((pass + 1))
}
expect_failure() {
  : > "$MOCK_FORGE_LOG"
  if bash "$deploy_script" > "$work/output" 2>&1; then
    printf 'FAIL: expected refusal\n' >&2
    exit 1
  fi
  assert_no_broadcast
  pass=$((pass + 1))
}

# Default run must be read-only even with correct network and valid inputs.
expect_success
grep -q "No transaction broadcast" "$work/output"

# Confirming on Ethereum mainnet must still fail.
export SPICA_CONFIRM_TESTNET_DEPLOY="YES_ARBITRUM_SEPOLIA_ONLY"
export FOUNDRY_ACCOUNT="fake-test-wallet"
export MOCK_CHAIN_ID=1
expect_failure
grep -q "expected Arbitrum Sepolia" "$work/output"

# Correct chain but missing a signer must fail if broadcast is requested.
export MOCK_CHAIN_ID=421614
unset FOUNDRY_ACCOUNT
expect_failure
grep -q "FOUNDRY_ACCOUNT" "$work/output"

# Invalid receiver and invalid supply must fail before reaching forge.
export FOUNDRY_ACCOUNT="fake-test-wallet"
export SPICA_TESTNET_HOLDER="invalid"
expect_failure
export SPICA_TESTNET_HOLDER="0x000000000000000000000000000000000000BEEF"
export SPICA_TESTNET_SUPPLY_BASE_UNITS="0"
expect_failure
export SPICA_TESTNET_SUPPLY_BASE_UNITS="1000000000000000000"

# Incorrect confirmation remains read-only.
export SPICA_CONFIRM_TESTNET_DEPLOY="YES"
expect_success

# With *all* gates satisfied, only the mock forge executable is invoked.
# No real network or transaction is used in this test.
export SPICA_CONFIRM_TESTNET_DEPLOY="YES_ARBITRUM_SEPOLIA_ONLY"
: > "$MOCK_FORGE_LOG"
bash "$deploy_script" > "$work/output" 2>&1
[[ $(wc -l < "$MOCK_FORGE_LOG") -eq 1 ]] || { echo "FAIL: expected one mock invocation" >&2; exit 1; }
grep -q -- "--broadcast" "$MOCK_FORGE_LOG"
grep -q -- "--account fake-test-wallet" "$MOCK_FORGE_LOG"
grep -q -- "--constructor-args $SPICA_TESTNET_HOLDER $SPICA_TESTNET_SUPPLY_BASE_UNITS" "$MOCK_FORGE_LOG"
pass=$((pass + 1))

printf 'PASS: %s offline deployment-guard scenarios\n' "$pass"
