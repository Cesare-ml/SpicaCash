#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Explicitly guarded testnet-only deployment helper. NEVER put keys in this script.
set -euo pipefail

command -v cast >/dev/null || { echo "Missing Foundry 'cast'." >&2; exit 1; }
command -v forge >/dev/null || { echo "Missing Foundry 'forge'." >&2; exit 1; }

: "${ARBITRUM_SEPOLIA_RPC_URL:?Set ARBITRUM_SEPOLIA_RPC_URL for chain 421614}"
: "${SPICA_TESTNET_HOLDER:?Set SPICA_TESTNET_HOLDER to an EVM address}"
: "${SPICA_TESTNET_SUPPLY_BASE_UNITS:?Set SPICA_TESTNET_SUPPLY_BASE_UNITS (18-decimal base units)}"

if [[ ! "$SPICA_TESTNET_HOLDER" =~ ^0x[[:xdigit:]]{40}$ ]]; then
  echo "Invalid testnet holder address." >&2
  exit 1
fi

if [[ ! "$SPICA_TESTNET_SUPPLY_BASE_UNITS" =~ ^[1-9][0-9]*$ ]]; then
  echo "Supply must be a positive integer in base units." >&2
  exit 1
fi

network_id="$(cast chain-id --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL")"
if [[ "$network_id" != "421614" ]]; then
  echo "REFUSED: expected Arbitrum Sepolia (421614), got $network_id." >&2
  exit 1
fi

echo "Preflight passed: Arbitrum Sepolia, chain ID 421614."
echo "Testnet holder: $SPICA_TESTNET_HOLDER"
echo "Testnet supply (base units): $SPICA_TESTNET_SUPPLY_BASE_UNITS"

if [[ "${SPICA_CONFIRM_TESTNET_DEPLOY:-}" != "YES_ARBITRUM_SEPOLIA_ONLY" ]]; then
  echo "No transaction broadcast. To deploy test tokens, set SPICA_CONFIRM_TESTNET_DEPLOY=YES_ARBITRUM_SEPOLIA_ONLY."
  exit 0
fi

: "${FOUNDRY_ACCOUNT:?Set FOUNDRY_ACCOUNT to the name of a local Foundry keystore account (no raw private keys)}"

forge create src/SpicaCash.sol:SpicaCash \
  --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL" \
  --account "$FOUNDRY_ACCOUNT" \
  --constructor-args "$SPICA_TESTNET_HOLDER" "$SPICA_TESTNET_SUPPLY_BASE_UNITS" \
  --broadcast
