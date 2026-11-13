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

# The ERC-20 constructor rejects address(0); refuse locally before gas can be spent.
if [[ "${SPICA_TESTNET_HOLDER,,}" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "REFUSED: testnet holder must not be the zero address." >&2
  exit 1
fi

if [[ ! "$SPICA_TESTNET_SUPPLY_BASE_UNITS" =~ ^[1-9][0-9]*$ ]]; then
  echo "Supply must be a positive canonical integer in base units (no leading zeros)." >&2
  exit 1
fi

# Validate the exact uint256 range using string length and lexicographic comparison.
# Bash arithmetic is limited to machine-sized integers; do NOT use it for 256-bit values.
max_uint256="115792089237316195423570985008687907853269984665640564039457584007913129639935"
if (( ${#SPICA_TESTNET_SUPPLY_BASE_UNITS} > ${#max_uint256} )) ||
   { (( ${#SPICA_TESTNET_SUPPLY_BASE_UNITS} == ${#max_uint256} )) &&
     [[ "$SPICA_TESTNET_SUPPLY_BASE_UNITS" > "$max_uint256" ]]; }; then
  echo "REFUSED: supply exceeds uint256 maximum." >&2
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

# Allow only simple local keystore aliases; reject option-like or path-like input.
if [[ ! "$FOUNDRY_ACCOUNT" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$ ]]; then
  echo "REFUSED: FOUNDRY_ACCOUNT must be a simple local keystore alias." >&2
  exit 1
fi

forge create src/SpicaCash.sol:SpicaCash \
  --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL" \
  --account "$FOUNDRY_ACCOUNT" \
  --constructor-args "$SPICA_TESTNET_HOLDER" "$SPICA_TESTNET_SUPPLY_BASE_UNITS" \
  --broadcast
