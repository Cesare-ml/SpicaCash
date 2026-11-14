#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Mock the local verification pipeline. NEVER run real Forge or blockchain RPC calls.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/project/scripts" "$work/project/node_modules/@openzeppelin/contracts/token/ERC20" "$work/bin" "$work/no-forge"
cp "$root/scripts/verify-local.sh" "$work/project/scripts/verify-local.sh"
: > "$work/project/node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol"
export MOCK_LOG="$work/tool-calls" MOCK_FAIL_STAGE=''

cat > "$work/bin/npm" <<'MOCK'
#!/usr/bin/env bash
printf 'npm %s\n' "$*" >> "$MOCK_LOG"
[[ -z "${NODE_OPTIONS:-}" && -z "${npm_config_node_options:-}" && -z "${NPM_CONFIG_NODE_OPTIONS:-}" ]] || exit 89
[[ -z "${ETH_RPC_URL:-}" && -z "${ARBITRUM_SEPOLIA_RPC_URL:-}" && -z "${FOUNDRY_ACCOUNT:-}" ]] || exit 81
[[ "$*" == '--node-options= --script-shell=/bin/sh --ignore-scripts run test:offline' ]] || exit 82
[[ "${MOCK_FAIL_STAGE:-}" != 'offline' ]] || exit 41
MOCK
cat > "$work/bin/forge" <<'MOCK'
#!/usr/bin/env bash
printf 'forge %s\n' "$*" >> "$MOCK_LOG"
[[ " $* " == *' --offline '* ]] || exit 87
[[ -z "${ETH_RPC_URL:-}" && -z "${ARBITRUM_SEPOLIA_RPC_URL:-}" && -z "${FOUNDRY_ACCOUNT:-}" ]] || exit 83
case "$*" in
  'build --offline --force') [[ "${MOCK_FAIL_STAGE:-}" != 'build' ]] || exit 42 ;;
  'test --offline -vv') [[ "${MOCK_FAIL_STAGE:-}" != 'tests' ]] || exit 43 ;;
  'test --offline --match-contract SpicaCashInvariantTest -vv')
    [[ "${MOCK_FAIL_STAGE:-}" != 'invariants' ]] || exit 44
    printf 'Synthetic test output for mocked gate only\n'
    ;;
  *) exit 84 ;;
esac
MOCK
cat > "$work/bin/node" <<'MOCK'
#!/usr/bin/env bash
printf 'node %s\n' "$*" >> "$MOCK_LOG"
[[ -z "${NODE_OPTIONS:-}" && -z "${npm_config_node_options:-}" && -z "${NPM_CONFIG_NODE_OPTIONS:-}" ]] || exit 88
[[ -z "${ETH_RPC_URL:-}" && -z "${ARBITRUM_SEPOLIA_RPC_URL:-}" && -z "${FOUNDRY_ACCOUNT:-}" ]] || exit 85
case "${1:-}" in
  scripts/check-dependency-lock.mjs) [[ "${MOCK_FAIL_STAGE:-}" != 'policy' ]] || exit 47 ;;
  scripts/check-abi.mjs) [[ "${MOCK_FAIL_STAGE:-}" != 'abi' ]] || exit 45 ;;
  scripts/check-foundry-invariants.mjs) [[ "${MOCK_FAIL_STAGE:-}" != 'evidence' ]] || exit 46 ;;
  *) exit 86 ;;
esac
MOCK
chmod +x "$work/bin/npm" "$work/bin/forge" "$work/bin/node"

# Construct an isolated PATH with no forge even when the host has it installed.
for tool in bash node npm dirname; do
  ln -s "$(command -v "$tool")" "$work/no-forge/$tool"
done
pass=0
: > "$MOCK_LOG"
if PATH="$work/no-forge" bash "$work/project/scripts/verify-local.sh" > "$work/output" 2>&1; then
  echo 'FAIL: missing Forge accepted' >&2; exit 1
fi
grep -Fq 'Foundry forge is not installed' "$work/output"
[[ ! -s "$MOCK_LOG" ]] || { echo 'FAIL: tools called before Forge check' >&2; exit 1; }
pass=$((pass+1))

export PATH="$work/bin:$PATH"
mv "$work/project/node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol" "$work/no-dependency"
if bash "$work/project/scripts/verify-local.sh" > "$work/output" 2>&1; then
  echo 'FAIL: missing dependency accepted' >&2; exit 1
fi
grep -Fq 'OpenZeppelin contracts dependency missing' "$work/output"
[[ ! -s "$MOCK_LOG" ]] || { echo 'FAIL: called tools with missing dependency' >&2; exit 1; }
pass=$((pass+1))
mv "$work/no-dependency" "$work/project/node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol"

# Deliberately preload RPC/account variables and an npm config override.
export ETH_RPC_URL='https://rpc.example.test/SECRET_VALUE'
export ARBITRUM_SEPOLIA_RPC_URL='https://rpc.example.test/SECRET_VALUE'
export FOUNDRY_ACCOUNT='fake-key'
export npm_config_ignore_scripts=false
export npm_config_script_shell='/tmp/untrusted-shell' NPM_CONFIG_SCRIPT_SHELL='/tmp/untrusted-shell'
export NODE_OPTIONS='--trace-warnings' npm_config_node_options='--trace-deprecation' NPM_CONFIG_NODE_OPTIONS='--no-warnings'

expect_stage_failure() {
  local stage="$1" last="$2" forbidden="$3"
  : > "$MOCK_LOG"
  export MOCK_FAIL_STAGE="$stage"
  if bash "$work/project/scripts/verify-local.sh" > "$work/output" 2>&1; then
    echo "FAIL: verifier accepted failed stage: $stage" >&2; exit 1
  fi
  grep -Fq "$last" "$MOCK_LOG" || { echo "FAIL: did not reach $stage" >&2; exit 1; }
  if grep -Fq "$forbidden" "$MOCK_LOG"; then
    echo "FAIL: verifier continued after $stage" >&2; exit 1
  fi
  if grep -Fq 'SECRET_VALUE' "$work/output"; then
    echo 'FAIL: inherited RPC token leaked' >&2; exit 1
  fi
  pass=$((pass+1))
}
expect_stage_failure policy 'node scripts/check-dependency-lock.mjs' 'npm --node-options= --script-shell=/bin/sh --ignore-scripts run test:offline'
expect_stage_failure offline 'npm --node-options= --script-shell=/bin/sh --ignore-scripts run test:offline' 'forge build --offline --force'
expect_stage_failure build 'forge build --offline --force' 'node scripts/check-abi.mjs'
expect_stage_failure abi 'node scripts/check-abi.mjs' 'forge test --offline -vv'
expect_stage_failure tests 'forge test --offline -vv' 'forge test --offline --match-contract SpicaCashInvariantTest -vv'
expect_stage_failure invariants 'forge test --offline --match-contract SpicaCashInvariantTest -vv' 'node scripts/check-foundry-invariants.mjs'

# The evidence check must block the final success line even after mock Forge exits 0.
expect_stage_failure evidence 'node scripts/check-foundry-invariants.mjs' 'NEVER_EXPECTED_MARKER'
if grep -Fq 'PASS: local offline + Solidity' "$work/output"; then
  echo 'FAIL: gate claimed success despite failed evidence' >&2; exit 1
fi

: > "$MOCK_LOG"
export MOCK_FAIL_STAGE=''
bash "$work/project/scripts/verify-local.sh" > "$work/output" 2>&1
[[ $(wc -l < "$MOCK_LOG") -eq 7 ]] || { cat "$MOCK_LOG" >&2; exit 1; }
grep -Fxq 'node scripts/check-dependency-lock.mjs' "$MOCK_LOG"
grep -Fxq 'npm --node-options= --script-shell=/bin/sh --ignore-scripts run test:offline' "$MOCK_LOG"
grep -Fxq 'forge build --offline --force' "$MOCK_LOG"
grep -Fxq 'node scripts/check-abi.mjs' "$MOCK_LOG"
grep -Fxq 'forge test --offline -vv' "$MOCK_LOG"
grep -Fxq 'forge test --offline --match-contract SpicaCashInvariantTest -vv' "$MOCK_LOG"
grep -Fq 'node scripts/check-foundry-invariants.mjs ' "$MOCK_LOG"
grep -Fq 'PASS: local offline + Solidity' "$work/output"
if grep -Fq 'SECRET_VALUE' "$work/output" || grep -Eq '^forge (create|script|broadcast)' "$MOCK_LOG"; then
  echo 'FAIL: leaked token or attempted deployment' >&2; exit 1
fi
pass=$((pass+1))
printf 'PASS: %s mocked local verification gate scenarios\n' "$pass"
