# Local Foundry verification receipt (optional, non-authorizing)

SpicaCash remains **pre-launch research**. An isolated verification on a PC is useful evidence for engineering review, **not** an audit, not proof of an authentic Foundry binary and never permission to mint, deploy, distribute or market a real token.

The offline-only tool `scripts/capture-local-verification.mjs` runs the already-reviewed `bash scripts/verify-local.sh` on a clean Git checkout and writes a small **local JSON receipt**. It does not capture full console output, wallet addresses, signing credentials, environment variable values or RPC URLs. It does not invoke a public network or deployment function. The existing verifier performs the compilation, tests, ABI and invariants.

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

If the repository is already cloned, update it with `git pull origin main` before running these commands. The working tree must be clean; local source/config/script edits or unexpected untracked files will block the receipt. The tool also checks for input mutations *after* the verification. It does not execute any Git commit, push, PR merge, installation, RPC call or blockchain transaction.

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

The portable synthetic regression suite uses temp directories and mocked Git/Forge/Bash commands. It runs without a browser, dependency install, network call or compiler:

```bash
node --test test/node/local-verification-evidence.test.mjs
```

It checks that passing, failing, missing-Forge and mid-run-modified scenarios are classified correctly; rejects dirty or wrong repositories, unsafe evidence directory symlinks and overwriting existing receipts; and ensures synthetic secret-bearing environment variables are removed before commands run. Mocked results **are not evidence that Foundry compiled the contract**.

## Review limits and next steps

Before checking off [SC-02 in the launch roadmap](LAUNCH_READINESS.md), an independent reviewer must reproduce the verification from a fresh trusted checkout, check the actual invariant selector/call tables and record the toolchain and source revision. The receipt can assist comparison but is self-reported and does not authenticate the executable, compiler output, dependencies, source trust, or reviewer identity. A dedicated security audit and legal review are still required before any real-world issuance.

The tool is not a scheduled automation, CI pipeline or GitHub Action. Run it manually only; do not use this feature to bypass the requirements in [AGENTS.md](../AGENTS.md).
