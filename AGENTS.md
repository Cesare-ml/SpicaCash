# AGENTS.md — SpicaCash contribution instructions

This is a public, pre-launch crypto-asset project. **There is no official deployed token.** Do not represent experimental code or addresses as a production release.

## Before contributing

1. Read `README.md`, `docs/NETWORK_EVALUATION.md`, and `docs/TOKEN_DESIGN.md`.
2. Check open issues and pull requests; avoid duplicating work.
3. Work on your own branch; keep changes small, reviewed and reversible.
4. Use English for public documentation and code comments.
5. Do not assume the `SPICA` ticker, token supply or chain choice is final.

## Scope and required review

- Proceed with threat modeling, documentation, local deterministic contract tests, static analysis and clearly testnet-only code.
- Do **not** deploy to mainnet, mint real assets, move funds, create a liquidity pool, list a token, connect real user wallets, or publish actual launch contract addresses without separate explicit authorization.
- Never request, print, commit or expose private keys, seed phrases, API secrets or signing credentials.
- No automated deployments and **no GitHub Actions** for this project.
- RPC URL validation for the Sepolia helper is a local HTTPS syntax gate, **not** evidence of trustworthy endpoint identity. Do not print or commit real provider URLs, credentials, or RPC query tokens.
- Run `npm run test:rpc-url` and `npm run test:rpc-deploy-guard` when changing testnet RPC handling. All tests must remain fully mocked/offline.
- Do not connect SpicaCash to VirgoStars AI credits, credit purchases, conversions or checkout in the initial release.
- Prefer minimal and verifiable standard-contract components; no fee-on-transfer, hidden mint functions, owner blacklists or speculative marketing claims.
- Prefer `bash scripts/bootstrap-deps.sh` to install dependencies: it checks the package and npm script policy before running `npm ci --ignore-scripts --no-audit --no-fund`. Before invoking **any npm script** directly, independently run `node scripts/check-dependency-lock.mjs`, and clear `NODE_OPTIONS`, `npm_config_node_options` and `NPM_CONFIG_NODE_OPTIONS` before running Node/npm directly. On Linux/WSL2 invoke reviewed scripts with `npm --node-options='' --script-shell=/bin/sh --ignore-scripts run <script-name>` to prevent inherited npm configuration from enabling pre/post lifecycle hooks. The reviewed policy pins the OpenZeppelin 5.4.0 SHA-512, all intended npm script commands, and `.npmrc` (`ignore-scripts=true`); it rejects unreviewed lifecycle hooks, overrides, workspace/bundled dependencies and lock metadata drift. Then install using **`npm ci --ignore-scripts --no-audit --no-fund`**, preferably from a clean checkout. Keep `--ignore-scripts` explicit even with `.npmrc`, and never rely on a lockfile digest alone to block executable scripts. New or changed scripts/dependencies require independent review; the control cannot protect against a maliciously rewritten checker itself.
- Treat inherited npm `script-shell` configuration as another execution surface for named scripts. The verifier must pass **`--script-shell=/bin/sh`** explicitly, even if `--ignore-scripts` is set; the harmless injection regression must demonstrate that an inherited custom shell runs without that override and is blocked with it. This pins only the npm child shell; it does not certify the host's `/bin/sh`, `PATH`, `BASH_ENV`, or npm binary.
- Treat inherited `NODE_OPTIONS` and npm's `node-options` config as executable-code injection surfaces: the supported bootstrap and verifier entrypoints clear them before invoking Node; the verifier also overrides npm child-process options explicitly. The offline suite must test these paths with a harmless preloader. This does not defend against a malicious executable on `PATH`, untrusted `BASH_ENV`, or compromised Node/npm binaries.
- For Solidity changes, run `bash scripts/verify-local.sh` directly on a machine with Foundry and local OpenZeppelin dependencies before reporting a verified PR. It checks the compiled ABI and requires three real invariant campaigns (at least 64 runs and 4096 calls each, zero reverts) plus two smoke tests. Inspect `move`, `approve`, and `pull` selector metrics manually; a transcript parser is not proof of a genuine forge binary or audit.
- The local Solidity verification gate must call **all** Forge build and test commands with `--offline`, with Solidity compiler 0.8.24 preinstalled, so verification cannot fetch compilers or use an accidental RPC. The mocked test gate must reject omission of this flag.
- The Foundry evidence checker must fail closed if any invariant lacks the expected per-selector metrics table or if `move`, `approve`, or `pull` was never invoked, reverted, was discarded, or has inconsistent call totals. Reject invariant and selector counters over 20 decimal digits before parsing with `BigInt`; keep this ceiling covered by synthetic malformed-transcript regressions. This automated guard complements, but does not replace, inspecting actual Foundry output and independent review.
- If changing the bootstrap or verification entrypoints, run `bash test/shell/bootstrap-deps.test.sh` and `bash test/shell/verify-local-guard.test.sh` using only synthetic identities and offline npm fixtures. Plain `npm run verify:local` is not a safe entrypoint when npm configuration may have been overridden.
- When changing `verify:local` or the Forge output parser, run `npm run test:foundry-evidence` and `npm run test:local-gate`. Also run `npm run test:foundry-format`; official Foundry output may contain separator rows between metrics entries and the parser must ignore only pure drawing rules, never malformed metric rows. Passing these mock/synthetic checks never replaces live Solidity compilation, full Forge tests, or manually inspected handler selector metrics.
- If Foundry is missing, report `verify:local` as **blocked**, even if `npm run test:offline` succeeds. The local gate never deploys, signs, calls RPCs, or enables GitHub Actions.
- For financial/security-sensitive changes, request review; provide exact tests actually run. Never claim an audit based on self-tests.

## Tokenomics-governance boundaries

- Read `docs/TOKENOMICS_GOVERNANCE.md` before changing economic-plan fields.
- The file `config/tokenomics.draft.json` intentionally contains **no** chosen supply, allocation, or multisig signers. Do not invent any without explicit human decisions.
- The offline validator can check mathematical consistency; it **never** authorizes deployment or token distribution.
- Do not use tokenomics JSON as input to an onchain deploy script or automated signing.
- For changes to this schema, add tests for malformed inputs, precision, and prohibited integrations.
- In a proposal, choose vesting parameters only if reviewed; do not assume default team allocations or privileges.
- Never add key material, personal signer identities, sensitive governance records, or user financial information to the public repository.

## Contributor grants (review-only)

- Read `docs/CONTRIBUTOR_GRANTS.md` before modifying grant proposals.
- Do not assign real SPICA amounts, wallets, recipient identities, or payment entitlements: there is no approved allocation.
- Grant proposals require a separate validated tokenomics proposal with a contributors-category allocation. Keep the exported `validateContributorGrants` function fail-closed for **every non-null companion tokenomics document**, including empty draft grants; do not rely solely on CLI pre-validation. Test direct API calls and the batch reconciler with unsafe economics on draft inputs.
- Canonical GitHub PR links are unverified documentary references, not proof of acceptance or unique identity. Human review remains mandatory.
- Never implement automatic payout, token-to-credits conversion, or a vesting execution transaction in this workstream.
- Run `npm run test:grants` and `npm run check:grants` when changing grant tooling.

## Multi-batch accounting constraints

- Read `docs/GRANT_BATCH_RECONCILIATION.md` before modifying batch reconciliation.
- A successful batch check is **not** evidence of GitHub acceptance or a grant entitlement. The caller must include **all** proposal files to detect cross-file duplicate PRs and overspending.
- Do not set real amounts or choose an allocation, signer or beneficiary without approval.
- Do not add any payment/signing/deployment code to the offline reconciliation workflow.
- Run `npm run test:grant-batches` and `npm run check:grant-batches` for changes.

## SHA-256 manifest integrity

- Read `docs/GRANT_MANIFEST_INTEGRITY.md` before changing `scripts/grant-manifest-core.mjs`.
- Manifest hashes pin *bytes*, not reviewer identities or authorization. For reviewed proposals, use `--expected-manifest-sha256` with an independently obtained, lowercase 64-character digest. A digest supplied by the same untrusted proposal is not independent evidence. Verify the canonical file inventory separately.
- Update the digest whenever the empty grant draft intentionally changes; never add unreviewed real tokenomics or grant recipients.
- Restrict manifest entries to local relative JSON; do not allow network downloads, symlinks, parent-path traversal or signing operations.
- For review proposals, use `--inventory-dir <relative-folder>` with a dedicated flat batch directory to detect omitted local JSON files. Nested folders, symlinks, special filesystem entries and case-varied `.JSON` extensions fail; use lowercase `.json` only. Keep the flat review inventory at **128 entries or fewer** (including ordinary notes); the scanner must fail closed at 129 entries without unbounded `readdirSync`. Verify externally that the directory is the canonical complete inventory; no local scan can prove it alone.
- Parse manifest and referenced grant/tokenomics JSON using `parseReviewJson` only after verifying the raw SHA-256 where a digest is provided; reject duplicate keys, malformed UTF-8, unpaired UTF-16 surrogates (including escaped halves), and nesting deeper than 128 levels. Run `npm run test:review-json` when modifying strict decoding.
- Preserve descriptor-bound and maximum-1-MiB reads in `scripts/read-small-file.mjs` for every manifest and referenced JSON file. Retain POSIX `O_NOFOLLOW`, supported `O_NONBLOCK`, the one-byte overflow probe, and before/after descriptor metadata checks; never weaken fail-closed behavior without regression tests. Windows inode checks and all metadata checks are only best effort: do not claim a complete TOCTOU defense or an atomic directory snapshot.
- The standalone tokenomics, contributor-grants and batch CLIs must also use `parseReviewJson(readSmallBytes(path))` for **all** JSON inputs, including companion tokenomics. Never fall back to unbounded `readFileSync` or call standalone inputs authenticated. Run `npm run test:strict-cli-json` and `npm run test:proposal-cli-integration` for real standalone proposal flows. Never skip `validateTokenomics` for an explicitly supplied companion file, even when the grant batch is only a draft; unsafe economic or AI-credit flags must fail closed. The multi-batch CLI and hashed-manifest loader must reject duplicate physical batch inputs before reconciliation, including lexical aliases and supported hard links; retain `scripts/distinct-batch-files.mjs` and run `npm run test:batch-identity`. Identity checks are best-effort on mutable directories, network filesystems and Windows.
- For a deliberate final-scope offline proposal review, pass `--pinned-proposal-review` together with `--require-proposal`, `--inventory-dir <flat-folder>` and `--expected-manifest-sha256 <trusted-lowercase-digest>`. The optional mode rejects missing safeguards (usage exit code 2) but cannot authenticate the provenance of the expected digest or prove authorization.
- On Windows PowerShell, use `npm run test:offline:node` for all checked-in Node `.test.mjs` suites plus the four draft CLI checks without Bash. It deliberately excludes `test/shell/deploy-guard.test.sh` and Foundry; do **not** claim the full offline/security suite passed on that basis. Review the omitted gates separately.
- Preserve the fail-closed mandatory Node test inventory in `scripts/run-offline-node.mjs`. When adding a security-critical `test/node/*.test.mjs` suite, register its exact lowercase filename in `REQUIRED_NODE_TESTS` and extend the runner regression tests. Missing or case-colliding mandatory suites must never yield a green `test:offline:node` run; this inventory does not authenticate file contents.
- Run `npm run test:safe-reader`, `npm run test:grant-manifest`, `npm run test:grant-inventory` and `npm run check:grant-manifest` after modifications.


- The merged grant-review tools add Node/Bash checks that have **not** been rerun end-to-end together with the ERC-20 guard suite. Do not claim `main` is release-verified until a complete clean checkout passes both offline scripts and all Foundry/Solidity tests.

- The portable Node verification baseline contains **17 mandatory `.test.mjs` suites**, including the hardened ERC-20 dependency, Foundry-output and RPC tests. Do not remove or rename any mandatory suite without explicit review. Refuse case-variant `.test.MJS`/`.TEST.mjs` suffixes and case-insensitive duplicate test filenames before running subprocesses; continue to discover additional canonical `.test.mjs` suites. This is only a completeness guard, not a proof that a test ran or passed.

## Pull request checklist

- State the goal, threat-model impact, and exact files changed.
- Document the chain/network and why a dependency is needed.
- Add relevant tests; report the actual local test commands and outcomes.
- Identify any untested path or security assumption.
- Link a design decision if altering supply, permissions, vesting, wallets or token economics.
- No merge of issuance or production-signing changes without separate approval.

## Legal and project identity

The codebase is for technical exploration, not an offer or recommendation to acquire any asset. Token issuance, public distribution, and exchange admission require a tailored review of applicable legal obligations, including MiCA where relevant. The prototype branch proposes the MIT License for source code; preserve the copyright notices. The VirgoStars brand remains distinct from the software license.
