#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Check that inherited Node preloads cannot run before verification.
# All npm work is mocked or uses an empty offline fixture; no chain/RPC access.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/project/scripts" "$work/project/node_modules/@openzeppelin/contracts/token/ERC20" "$work/mockbin" "$work/npm-fixture"
for file in package.json package-lock.json .npmrc; do cp "$root/$file" "$work/project/$file"; done
for file in bootstrap-deps.sh verify-local.sh check-dependency-lock.mjs; do cp "$root/scripts/$file" "$work/project/scripts/$file"; done
: > "$work/project/node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol"
cat > "$work/preload.cjs" <<'JS'
require('fs').writeFileSync(process.env.SPICA_PRELOAD_MARKER, 'untrusted preload executed');
JS
export SPICA_PRELOAD_MARKER="$work/preload-invoked"
pass=0
real_npm="$(command -v npm)"

# Sanity-check that the harmless preload would really run without protection.
NODE_OPTIONS="--require=$work/preload.cjs" node -e 'void 0'
[[ -f "$SPICA_PRELOAD_MARKER" ]] || { echo 'FAIL: preload probe did not execute' >&2; exit 1; }
rm -f "$SPICA_PRELOAD_MARKER"
pass=$((pass+1))

cat > "$work/mockbin/npm" <<'MOCK'
#!/usr/bin/env bash
[[ -z "${NODE_OPTIONS:-}" && -z "${npm_config_node_options:-}" && -z "${NPM_CONFIG_NODE_OPTIONS:-}" ]] || exit 90
printf '%s\n' "$*" >> "$SPICA_NPM_CALLS"
case "$*" in
  'ci --ignore-scripts --no-audit --no-fund') exit 0 ;;
  '--node-options= --script-shell=/bin/sh --ignore-scripts run test:offline') exit 79 ;;
  *) exit 91 ;;
esac
MOCK
cat > "$work/mockbin/forge" <<'MOCK'
#!/usr/bin/env bash
exit 87
MOCK
chmod +x "$work/mockbin/npm" "$work/mockbin/forge"
export SPICA_NPM_CALLS="$work/npm-calls"
export NODE_OPTIONS="--require=$work/preload.cjs"
export npm_config_node_options="--require=$work/preload.cjs"
export NPM_CONFIG_NODE_OPTIONS="--require=$work/preload.cjs"
export PATH="$work/mockbin:$PATH"
: > "$SPICA_NPM_CALLS"
bash "$work/project/scripts/bootstrap-deps.sh" > "$work/bootstrap.out" 2>&1
[[ ! -e "$SPICA_PRELOAD_MARKER" ]] || { echo 'FAIL: bootstrap executed injected Node preload' >&2; exit 1; }
[[ "$(cat "$SPICA_NPM_CALLS")" == 'ci --ignore-scripts --no-audit --no-fund' ]]
pass=$((pass+1))

# Stop the verifier safely at its npm stage; real Node must have run the checker
# before that point, and neither Node nor npm may see the inherited preload.
: > "$SPICA_NPM_CALLS"
if bash "$work/project/scripts/verify-local.sh" > "$work/verify.out" 2>&1; then
  echo 'FAIL: mock npm failure was accepted' >&2; exit 1
fi
[[ ! -e "$SPICA_PRELOAD_MARKER" ]] || { echo 'FAIL: verifier executed injected Node preload' >&2; exit 1; }
[[ "$(cat "$SPICA_NPM_CALLS")" == '--node-options= --script-shell=/bin/sh --ignore-scripts run test:offline' ]]
grep -Fq 'Gate 1/5' "$work/verify.out"
pass=$((pass+1))

# Demonstrate with actual npm that explicit --node-options= suppresses config
# injection into the named script, even with user env asking for a preload.
cat > "$work/npm-fixture/package.json" <<'JSON'
{"name":"spica-npm-injection-check","version":"0.0.1","private":true,"scripts":{"test:offline":"node -e \"require('fs').writeFileSync('explicit-test','ok')\""}}
JSON
cat > "$work/npm-fixture/.npmrc" <<'NPMRC'
ignore-scripts=true
NPMRC
rm -f "$SPICA_PRELOAD_MARKER"
(
  cd "$work/npm-fixture"
  NODE_OPTIONS='' NPM_CONFIG_NODE_OPTIONS='' npm_config_node_options="--require=$work/preload.cjs" \
    "$real_npm" --node-options='' --ignore-scripts run test:offline > "$work/npm.out" 2>&1
)
[[ ! -e "$SPICA_PRELOAD_MARKER" ]] || { echo 'FAIL: npm test child executed injected preload' >&2; exit 1; }
[[ -f "$work/npm-fixture/explicit-test" ]] || { cat "$work/npm.out" >&2; echo 'FAIL: explicit npm test never ran' >&2; exit 1; }
pass=$((pass+1))

# npm's script-shell setting runs a user-chosen shell for *named* scripts even
# if --ignore-scripts disables lifecycle hooks. Demonstrate the risk using a
# harmless custom shell that only leaves a marker before delegating to /bin/sh.
cat > "$work/untrusted-script-shell" <<'SHELL'
#!/bin/sh
printf 'inherited npm shell invoked\n' > "$SPICA_UNTRUSTED_SHELL_MARKER"
exec /bin/sh "$@"
SHELL
chmod +x "$work/untrusted-script-shell"
export SPICA_UNTRUSTED_SHELL_MARKER="$work/untrusted-shell-invoked"
rm -f "$SPICA_UNTRUSTED_SHELL_MARKER" "$work/npm-fixture/explicit-test"
(
  cd "$work/npm-fixture"
  NODE_OPTIONS='' NPM_CONFIG_NODE_OPTIONS='' npm_config_node_options='' \
    npm_config_script_shell="$work/untrusted-script-shell" \
    "$real_npm" --node-options='' --ignore-scripts run test:offline > "$work/unsafe-shell.out" 2>&1
)
[[ -f "$SPICA_UNTRUSTED_SHELL_MARKER" && -f "$work/npm-fixture/explicit-test" ]] || {
  echo 'FAIL: inherited npm script-shell risk was not reproduced' >&2; exit 1
}
pass=$((pass+1))

# Explicit /bin/sh must override the injected npm shell while still running
# the intended test command. No network access, package install or signing.
rm -f "$SPICA_UNTRUSTED_SHELL_MARKER" "$work/npm-fixture/explicit-test"
(
  cd "$work/npm-fixture"
  NODE_OPTIONS='' NPM_CONFIG_NODE_OPTIONS='' npm_config_node_options='' \
    npm_config_script_shell="$work/untrusted-script-shell" \
    "$real_npm" --node-options='' --script-shell=/bin/sh --ignore-scripts run test:offline > "$work/safe-shell.out" 2>&1
)
[[ ! -e "$SPICA_UNTRUSTED_SHELL_MARKER" && -f "$work/npm-fixture/explicit-test" ]] || {
  echo 'FAIL: explicit /bin/sh did not override inherited npm script-shell' >&2; exit 1
}
pass=$((pass+1))
printf 'PASS: %s inherited Node preload guard scenarios\n' "$pass"
