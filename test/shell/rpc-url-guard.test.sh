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

# An almost-correct confirmation is not authorization to broadcast.
# The helper must remain read-only unless the exact sentinel is provided.
for invalid_confirmation in YES yes_arbitrum_sepolia_only YES_ARBITRUM_SEPOLIA_ONLY_EXTRA; do
  export SPICA_CONFIRM_TESTNET_DEPLOY="$invalid_confirmation"
  : > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
  bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1
  grep -q 'No transaction broadcast' "$work/out"
  [[ ! -s "$MOCK_FORGE_LOG" ]] || { echo 'FAIL: forged confirmation triggered broadcast' >&2; exit 1; }
  pass=$((pass+1))
done
export SPICA_CONFIRM_TESTNET_DEPLOY='YES_ARBITRUM_SEPOLIA_ONLY'

# Constructor preflight must refuse invalid holder/supply values before
# forge is invoked, even with explicit mock broadcast confirmation.
assert_no_forge_on_invalid_constructor() {
  : > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
  if bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1; then
    echo 'FAIL: invalid constructor input accepted' >&2; exit 1
  fi
  [[ ! -s "$MOCK_FORGE_LOG" ]] || { echo 'FAIL: forge ran for invalid constructor input' >&2; exit 1; }
  if grep -q 'SECRET_VALUE' "$work/out"; then
    echo 'FAIL: invalid constructor error leaked provider token' >&2; exit 1
  fi
  pass=$((pass+1))
}
export SPICA_TESTNET_HOLDER='0x0000000000000000000000000000000000000000'
assert_no_forge_on_invalid_constructor
export SPICA_TESTNET_HOLDER='0x000000000000000000000000000000000000BEEF'
for invalid_supply in 0 01 1.0 115792089237316195423570985008687907853269984665640564039457584007913129639936; do
  export SPICA_TESTNET_SUPPLY_BASE_UNITS="$invalid_supply"
  assert_no_forge_on_invalid_constructor
done
export SPICA_TESTNET_SUPPLY_BASE_UNITS='1'

# Boundary regression: uint256 max is valid, but never broadcasts without
# explicit confirmation. This checks the comparison does not reject equality.
export SPICA_TESTNET_SUPPLY_BASE_UNITS='115792089237316195423570985008687907853269984665640564039457584007913129639935'
unset SPICA_CONFIRM_TESTNET_DEPLOY
: > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1
grep -q 'No transaction broadcast' "$work/out"
[[ $(wc -l < "$MOCK_CAST_LOG") -eq 1 && ! -s "$MOCK_FORGE_LOG" ]] || {
  echo 'FAIL: uint256 boundary preflight or no-broadcast behavior regressed' >&2; exit 1;
}
pass=$((pass+1))
export SPICA_TESTNET_SUPPLY_BASE_UNITS='1'
export SPICA_CONFIRM_TESTNET_DEPLOY='YES_ARBITRUM_SEPOLIA_ONLY'

# A forged or option-like keystore alias must never reach forge, even if
# the caller explicitly requested a testnet broadcast.
for unsafe_account in '--private-key' '../keystore' 'alias with spaces'; do
  export FOUNDRY_ACCOUNT="$unsafe_account"
  : > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
  if bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1; then
    echo 'FAIL: unsafe keystore alias accepted' >&2; exit 1
  fi
  grep -q 'FOUNDRY_ACCOUNT must be a simple local keystore alias' "$work/out"
  [[ ! -s "$MOCK_FORGE_LOG" ]] || { echo 'FAIL: forge ran for unsafe keystore alias' >&2; exit 1; }
  pass=$((pass+1))
done
export FOUNDRY_ACCOUNT='synthetic-test-account'

# Explicit confirmation is insufficient without a local keystore alias.
# A missing alias must never fall back to an implicit Foundry account.
unset FOUNDRY_ACCOUNT
: > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
if bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1; then
  echo 'FAIL: deployment accepted without a keystore alias' >&2; exit 1
fi
[[ ! -s "$MOCK_FORGE_LOG" ]] || { echo 'FAIL: forge ran without a keystore alias' >&2; exit 1; }
pass=$((pass+1))

# The documented maximum alias length (64) remains usable with a mocked
# command, preventing the negative tests from making all aliases invalid.
export FOUNDRY_ACCOUNT="$(printf 'a%.0s' {1..64})"
: > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1
[[ $(wc -l < "$MOCK_FORGE_LOG") -eq 1 ]] || {
  echo 'FAIL: valid 64-character keystore alias was rejected' >&2; exit 1;
}
pass=$((pass+1))
export FOUNDRY_ACCOUNT='synthetic-test-account'

# The next character beyond the allowed 64 must be rejected before forge.
export FOUNDRY_ACCOUNT="$(printf 'a%.0s' {1..65})"
: > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
if bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1; then
  echo 'FAIL: 65-character keystore alias accepted' >&2; exit 1
fi
grep -q 'FOUNDRY_ACCOUNT must be a simple local keystore alias' "$work/out"
[[ ! -s "$MOCK_FORGE_LOG" ]] || { echo 'FAIL: forge ran with oversized alias' >&2; exit 1; }
pass=$((pass+1))
export FOUNDRY_ACCOUNT='synthetic-test-account'

# Reject a malformed holder without ever invoking forge.
export SPICA_TESTNET_HOLDER='0x1234'
: > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
if bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1; then
  echo 'FAIL: malformed holder accepted' >&2; exit 1
fi
grep -q 'Invalid testnet holder address' "$work/out"
[[ ! -s "$MOCK_FORGE_LOG" ]] || { echo 'FAIL: forge ran with malformed holder' >&2; exit 1; }
pass=$((pass+1))
export SPICA_TESTNET_HOLDER='0x000000000000000000000000000000000000BEEF'

# Inherited Foundry/Dapp settings must be refused before cast or forge executes.
reject_override_before_rpc() {
  : > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
  if bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1; then
    echo 'FAIL: unsafe inherited Foundry/Dapp override accepted' >&2; exit 1
  fi
  grep -q 'REFUSED: inherited Foundry/Dapp environment override' "$work/out"
  [[ ! -s "$MOCK_CAST_LOG" && ! -s "$MOCK_FORGE_LOG" ]] || { echo 'FAIL: cast or forge ran despite inherited override' >&2; exit 1; }
  if grep -q 'SECRET_VALUE' "$work/out"; then echo 'FAIL: override value leaked in output' >&2; exit 1; fi
  pass=$((pass+1))
}
for override_name in FOUNDRY_ETH_RPC_URL DAPP_RPC_URL FOUNDRY_PROFILE; do
  export "$override_name=https://unreviewed.example.test/SECRET_VALUE"
  reject_override_before_rpc
  unset "$override_name"
done


# A present-but-empty override must still be refused; testing only values
# would allow an inherited setting to slip through the environment gate.
export FOUNDRY_PROFILE=''
reject_override_before_rpc
unset FOUNDRY_PROFILE
export DAPP_RPC_URL=''
reject_override_before_rpc
unset DAPP_RPC_URL

# Exported Bash functions can shadow command lookup after this script starts.
reject_exported_tool_function() {
  : > "$MOCK_CAST_LOG"; : > "$MOCK_FORGE_LOG"
  if bash "$root/scripts/deploy-arbitrum-sepolia.sh" > "$work/out" 2>&1; then
    echo 'FAIL: exported tool-shadowing function was accepted' >&2; exit 1
  fi
  grep -q 'REFUSED: exported shell function overrides a required tool' "$work/out"
  [[ ! -s "$MOCK_CAST_LOG" && ! -s "$MOCK_FORGE_LOG" ]] || { echo 'FAIL: a mocked tool ran despite exported function' >&2; exit 1; }
  if grep -q 'FUNCTION_SENTINEL' "$work/out"; then echo 'FAIL: exported function body was executed' >&2; exit 1; fi
  pass=$((pass+1))
}
forge() { printf 'FUNCTION_SENTINEL\n' >> "$MOCK_FORGE_LOG"; }
export -f forge
reject_exported_tool_function
unset -f forge
cast() { printf 'FUNCTION_SENTINEL\n' >> "$MOCK_CAST_LOG"; }
export -f cast
reject_exported_tool_function
unset -f cast
node() { printf 'FUNCTION_SENTINEL\n' >> "$MOCK_FORGE_LOG"; }
export -f node
reject_exported_tool_function
unset -f node

printf 'PASS: %d mocked RPC safety integration scenarios\n' "$pass"
