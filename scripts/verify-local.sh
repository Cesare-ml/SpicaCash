#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Local-only verification gate: no deployment, wallet use, signing or RPC calls.
# Requires preinstalled solc 0.8.24: Forge must not fetch compiler binaries.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Prevent inherited Node preloads from executing before dependency preflight.
unset NODE_OPTIONS npm_config_node_options NPM_CONFIG_NODE_OPTIONS

command -v node >/dev/null || { echo 'FAIL: Node.js 20+ is required.' >&2; exit 2; }
command -v npm >/dev/null || { echo 'FAIL: npm is required.' >&2; exit 2; }
command -v forge >/dev/null || { echo 'FAIL: Foundry forge is not installed; Solidity tests were NOT run.' >&2; exit 2; }
[[ -f node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol ]] || {
  echo 'FAIL: local OpenZeppelin contracts dependency missing; install npm dependencies before verification.' >&2
  exit 2
}

# Do not let inherited RPC/wallet env vars cause a fork or real testnet action.
unset ETH_RPC_URL ARBITRUM_SEPOLIA_RPC_URL FOUNDRY_FORK_URL FOUNDRY_RPC_URL
unset SPICA_CONFIRM_TESTNET_DEPLOY FOUNDRY_ACCOUNT
export NO_COLOR=1

# Check package scripts, install policy and tarball integrity *before* npm can
# run pre/post hooks. The explicit npm flag overrides inherited config.
node scripts/check-dependency-lock.mjs
printf 'Gate 1/5: offline Node/Bash tests\n'
# Override user/global npm config that could inject NODE_OPTIONS or a hostile
# script-shell executable into test child processes.
npm --node-options='' --script-shell=/bin/sh --ignore-scripts run test:offline
printf 'Gate 2/5: compile fresh Solidity artifacts\n'
forge build --offline --force
printf 'Gate 3/5: inspect the real compiled SpicaCash ABI\n'
node scripts/check-abi.mjs
printf 'Gate 4/5: run full Solidity unit/fuzz/invariant tests\n'
forge test --offline -vv
printf 'Gate 5/5: re-run invariant suite and verify actual campaign evidence\n'
report="$(mktemp)"
trap 'rm -f "$report"' EXIT
forge test --offline --match-contract SpicaCashInvariantTest -vv | tee "$report"
node scripts/check-foundry-invariants.mjs "$report"
printf 'PASS: local offline + Solidity compilation, ABI and Foundry invariant gates.\n'
printf 'NOTE: inspect selector metrics for move(), approve(), pull() manually; this is not an audit.\n'
