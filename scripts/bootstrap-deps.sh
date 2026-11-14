#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Review-only dependency install. This never invokes Foundry or a blockchain RPC.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

command -v node >/dev/null || { echo 'FAIL: Node.js 20+ is required.' >&2; exit 2; }
command -v npm >/dev/null || { echo 'FAIL: npm is required.' >&2; exit 2; }

# Do not launch npm until the reviewed package manifest, lockfile and .npmrc
# pass local validation: npm can run arbitrary pre/post lifecycle hooks.
node scripts/check-dependency-lock.mjs

# Command-line --ignore-scripts takes precedence over inherited npm config.
# A changed or hostile npm_config_ignore_scripts must not enable hooks.
npm ci --ignore-scripts --no-audit --no-fund
printf 'PASS: installed only the reviewed npm lockfile with lifecycle hooks disabled.\n'
