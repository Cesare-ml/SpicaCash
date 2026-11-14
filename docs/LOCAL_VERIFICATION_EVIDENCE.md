# Local Foundry verification receipt (optional, non-authorizing)

SpicaCash remains **pre-launch research**. An isolated verification on a PC is useful evidence for engineering review, **not** an audit, not proof of an authentic Foundry binary and never permission to mint, deploy, distribute or market a real token.

The offline-only tool `scripts/capture-local-verification.mjs` runs the already-reviewed `bash scripts/verify-local.sh` on a clean Git checkout and writes a small **local JSON receipt**. The wrapper sanitizes its **child process environment** before invoking Git, Foundry or Bash: in addition to RPC, account and Node/npm preload settings, it drops inherited `GIT_*`, `NPM_CONFIG_*`, `NODE_*`, `FOUNDRY_*`, `DAPP_*`, exported Bash functions, `BASH_ENV`, `ENV`, shell-option startup variables, and native loader `LD_*`/`DYLD_*` overrides. It retains ordinary tool discovery variables such as `PATH`, `HOME` and temporary directories. Standalone sensitive names are filtered **case-insensitively**, including `BASH_ENV`, `ENV`, RPC URLs and deployment-confirmation controls, so case-varied host inputs cannot bypass the guard. The resulting child environment is a null-prototype object to avoid inherited setters. A locally installed toolchain that depends on custom `LD_LIBRARY_PATH` may need to be made self-contained or configured in a trusted environment before running. It does not capture full console output, wallet addresses, signing credentials, environment variable values or RPC URLs. It does not invoke a public network or deployment function. The existing verifier performs the compilation, tests, ABI and invariants.

## Windows 11 + WSL2 usage

Use a trusted WSL2 terminal with Git, Node.js 20+, npm, Foundry, a locally installed solc 0.8.24 and the project's reviewed OpenZeppelin dependency.

```bash
git clone https://github.com/Cesare-ml/SpicaCash.git
cd SpicaCash

# Use the reviewed dependency bootstrap, not an arbitrary npm command.
bash scripts/bootstrap-deps.sh

# Protect against inherited Node.js preloads BEFORE starting Node.
unset NODE_OPTIONS npm_config_node_options NPM_CONFIG_NODE_OPTIONS
node scripts/capture-local-verification.mjs
```

If the repository is already cloned, update it with `git pull origin main` before running these commands. The working tree must be clean; local source/config/script edits or unexpected untracked files will block the receipt. The wrapper also compares each critical file's **current Git blob hash** against the corresponding `HEAD:path` blob, rather than trusting `git status` alone. This rejects locally modified inputs hidden by Git's `assume-unchanged` (and equivalent index flags) even if the checkout appears clean. It repeats this comparison after the verifier runs. The check compares raw file bytes and may conservatively reject a checkout with automatic line-ending or custom content-filter transformations (for example, a Windows CRLF working tree matching an LF commit). Use a fresh WSL2 checkout with unchanged LF files; do not bypass the mismatch. The hash check uses the actual local Git executable, so a compromised Git binary, PATH, local Git object database or filesystem still falls outside the trust guarantee. The tool also checks for input mutations *after* the verification. It does not execute any Git commit, push, PR merge, installation, RPC call or blockchain transaction.

When Foundry is installed, the wrapper displays `verify-local.sh` output directly in the terminal and stores a local file such as:

```text
.spica-evidence/verification-abcdef123456-20261114123456.json
```

The example filename is illustrative; the actual filename incorporates your Git commit and UTC timestamp. The directory is intentionally in `.gitignore`. **Do not copy the receipt into the public repository as automatic proof of readiness.**

For a missing `forge`, the receipt says `BLOCKED`; for failing tests it says `FAIL`; for changed input files it says `INVALIDATED`. **Only an exit code 0 from the reviewed verifier, with stable input hashes and a clean checkout, yields `PASS`.** The wrapper itself exits nonzero for all other statuses.

## What the JSON contains

- UTC execution timestamp and exact, checked Git commit SHA
- Node.js / Forge versions (if a recognized version string was returned), platform and clean-checkout status
- SHA-256 fingerprints of the checked-in Solidity contract, Foundry profile, npm lockfile and critical verification/checker scripts
- Verifier exit code, signal, result status and whether inputs were unchanged after execution
- Permanent `releaseAuthorized: false` and `auditCompleted: false`

The report deliberately contains **no** seed, password, key, account address, RPC URL, wallet balance, external contract address or price. Raw Forge output remains visible in your terminal, but is **not** written to disk by this script. If independent reviewers need the full invariant tables, record and inspect those manually and ensure any copy is checked for sensitive values before sharing.

## Test without Foundry or Git network access

The regression suite includes a **real temporary Git repository** where a tracked Foundry profile is changed after setting `git update-index --assume-unchanged`. Git porcelain status remains empty in that fixture, but the committed-blob comparison refuses to create a new verification receipt. These are **local Git/Node integration checks with mocked Forge/Bash**, not real Solidity test runs.

The portable synthetic regression suite uses temp directories and mocked Git/Forge/Bash commands. It runs without a browser, dependency install, network call or compiler:

```bash
node --test test/node/local-verification-evidence.test.mjs
```

It checks that passing, failing, missing-Forge and mid-run-modified scenarios are classified correctly; rejects dirty or wrong repositories, unsafe evidence directory symlinks and overwriting existing receipts; and ensures synthetic Git, shell startup, npm, Node, loader and secret-bearing overrides are removed before every mocked child command runs. Mocked results **are not evidence that Foundry compiled the contract**.

## Review limits and next steps

Before checking off [SC-02 in the launch roadmap](LAUNCH_READINESS.md), an independent reviewer must reproduce the verification from a fresh trusted checkout, check the actual invariant selector/call tables and record the toolchain and source revision. The receipt can assist comparison but is self-reported and does not authenticate the executable, compiler output, dependencies, source trust, or reviewer identity. This filter cannot defend against a malicious executable already selected by `PATH`, an already-compromised parent Node process, host/global Git configuration, a hostile machine or altered binaries. It does not sanitize the parent process before Node starts. Do not treat an environment-filter test as proof of trusted execution. A dedicated security audit and legal review are still required before any real-world issuance.

The tool is not a scheduled automation, CI pipeline or GitHub Action. Run it manually only; do not use this feature to bypass the requirements in [AGENTS.md](../AGENTS.md).
