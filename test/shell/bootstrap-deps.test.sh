#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# All mocked npm invocations are harmless; the real npm fixture has no deps.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
real_npm="$(command -v npm)"
real_path="$PATH"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/project/scripts" "$work/mockbin"
cp "$root/scripts/bootstrap-deps.sh" "$work/project/scripts/bootstrap-deps.sh"

cat > "$work/mockbin/node" <<'MOCK'
#!/usr/bin/env bash
printf 'node %s\n' "$*" >> "$MOCK_LOG"
[[ -z "${NODE_OPTIONS:-}" && -z "${npm_config_node_options:-}" && -z "${NPM_CONFIG_NODE_OPTIONS:-}" ]] || exit 89
[[ "$*" == 'scripts/check-dependency-lock.mjs' ]] || exit 75
[[ "${MOCK_POLICY_FAIL:-0}" != 1 ]] || exit 76
MOCK
cat > "$work/mockbin/npm" <<'MOCK'
#!/usr/bin/env bash
printf 'npm %s\n' "$*" >> "$MOCK_LOG"
[[ -z "${NODE_OPTIONS:-}" && -z "${npm_config_node_options:-}" && -z "${NPM_CONFIG_NODE_OPTIONS:-}" ]] || exit 90
[[ "$*" == 'ci --ignore-scripts --no-audit --no-fund' ]] || exit 77
[[ "${MOCK_INSTALL_FAIL:-0}" != 1 ]] || exit 78
MOCK
chmod +x "$work/mockbin/node" "$work/mockbin/npm"
export MOCK_LOG="$work/tool-calls" PATH="$work/mockbin:$PATH"
pass=0

# Success, with a caller working directory outside the project and an inherited
# npm config value that would otherwise re-enable lifecycle scripts.
: > "$MOCK_LOG"
export npm_config_ignore_scripts=false
export NODE_OPTIONS='--trace-warnings' npm_config_node_options='--trace-deprecation' NPM_CONFIG_NODE_OPTIONS='--no-warnings' 
(cd /tmp && bash "$work/project/scripts/bootstrap-deps.sh" > "$work/out" 2>&1)
[[ $(wc -l < "$MOCK_LOG") -eq 2 ]]
[[ "$(head -n 1 "$MOCK_LOG")" == 'node scripts/check-dependency-lock.mjs' ]]
[[ "$(tail -n 1 "$MOCK_LOG")" == 'npm ci --ignore-scripts --no-audit --no-fund' ]]
grep -Fq 'PASS: installed only the reviewed npm lockfile' "$work/out"
pass=$((pass + 1))

# Invalid metadata must block npm entirely, including npm lifecycle hooks.
: > "$MOCK_LOG"
export MOCK_POLICY_FAIL=1
if bash "$work/project/scripts/bootstrap-deps.sh" > "$work/out" 2>&1; then
  echo 'FAIL: invalid dependency policy allowed installation' >&2; exit 1
fi
[[ $(wc -l < "$MOCK_LOG") -eq 1 ]]
[[ "$(cat "$MOCK_LOG")" == 'node scripts/check-dependency-lock.mjs' ]]
if grep -Fq 'PASS: installed' "$work/out"; then exit 1; fi
unset MOCK_POLICY_FAIL
pass=$((pass + 1))

# npm failure is propagated instead of falsely claiming verified dependencies.
: > "$MOCK_LOG"
export MOCK_INSTALL_FAIL=1
if bash "$work/project/scripts/bootstrap-deps.sh" > "$work/out" 2>&1; then
  echo 'FAIL: unsuccessful npm ci was accepted' >&2; exit 1
fi
[[ $(wc -l < "$MOCK_LOG") -eq 2 ]]
if grep -Fq 'PASS: installed' "$work/out"; then exit 1; fi
unset MOCK_INSTALL_FAIL
pass=$((pass + 1))

unset NODE_OPTIONS npm_config_node_options NPM_CONFIG_NODE_OPTIONS

# Use the *real* npm binary on an empty, offline fixture to establish that the
# explicit --ignore-scripts wins even when user config requests hooks.
mkdir -p "$work/fixture"
cat > "$work/fixture/package.json" <<'JSON'
{"name":"spica-empty-lifecycle-check","version":"0.0.1","private":true,"scripts":{"preinstall":"node -e \"require('fs').writeFileSync('unexpected-hook','executed')\""}}
JSON
cat > "$work/fixture/package-lock.json" <<'JSON'
{"name":"spica-empty-lifecycle-check","version":"0.0.1","lockfileVersion":3,"requires":true,"packages":{"":{"name":"spica-empty-lifecycle-check","version":"0.0.1"}}}
JSON
if ! (cd "$work/fixture" && PATH="$real_path" npm_config_ignore_scripts=false "$real_npm" ci --offline --ignore-scripts --no-audit --no-fund > "$work/npm-out" 2>&1); then
  cat "$work/npm-out" >&2
  echo 'FAIL: offline npm lifecycle fixture failed' >&2; exit 1
fi
[[ ! -e "$work/fixture/unexpected-hook" ]] || { echo 'FAIL: lifecycle hook executed despite --ignore-scripts' >&2; exit 1; }
pass=$((pass + 1))

# Explicit npm --ignore-scripts must also suppress pre/post run-script hooks,
# while still allowing the intentionally invoked test script itself.
cat > "$work/fixture/package.json" <<'JSON'
{"name":"spica-empty-lifecycle-check","version":"0.0.1","private":true,"scripts":{"pretest:offline":"node -e \"require('fs').writeFileSync('unexpected-hook','executed')\"","test:offline":"node -e \"require('fs').writeFileSync('expected-test','ok')\""}}
JSON
if ! (cd "$work/fixture" && PATH="$real_path" npm_config_ignore_scripts=false "$real_npm" --ignore-scripts run test:offline --offline > "$work/npm-run-out" 2>&1); then
  cat "$work/npm-run-out" >&2
  echo 'FAIL: offline npm run-script fixture failed' >&2; exit 1
fi
[[ -e "$work/fixture/expected-test" && ! -e "$work/fixture/unexpected-hook" ]] || {
  echo 'FAIL: npm ran unexpected pretest hook or skipped the explicit test script' >&2; exit 1
}
pass=$((pass + 1))

printf 'PASS: %d dependency bootstrap guard scenarios\n' "$pass"
