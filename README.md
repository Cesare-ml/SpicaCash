# SpicaCash

**SpicaCash** is a proposed open-source cryptocurrency for the **VirgoStars** ecosystem.

> **Pre-launch / research stage.** No official token contract has been deployed, no mainnet token address exists, and no exchange listing or liquidity is claimed. Beware of impersonators.

## Principles

- SpicaCash is separate from VirgoStars AI usage credits and from payments on virgostars.it.
- The first version **will not** be accepted for purchasing AI credits or site services.
- Open-source code, independently reviewable tokenomics and transparent treasury governance.
- Security reviews, automated tests and a public testnet trial before considering mainnet.
- No guaranteed returns, fixed price, speculative promises or automatic rewards for merely running AI.
- Developer and volunteer rewards, if introduced, will be based on verified contributions, clear criteria and applicable legal review.

## Network

**Recommended for evaluation: Arbitrum One** (Ethereum L2, ERC-20), with Base as the main alternative. This is an architectural preference, **not** a deployment decision. See [Network evaluation](docs/NETWORK_EVALUATION.md).

Why not pick Polygon by default? Polygon PoS has a separate validator/security model and is not an Ethereum rollup. It remains a viable low-fee EVM network, but the first choice should prioritize rollup security and the project's open-source/community ethos.

## Experimental ERC-20 prototype

The initial Solidity implementation, unit/fuzz test suite and guarded Arbitrum Sepolia helper have been consolidated on **main** as experimental source code, **not a released or deployed token**.

- [Prototype and local instructions](docs/PROTOTYPE.md)
- Contract: `src/SpicaCash.sol` (simple fixed supply, no owner or privileged minting)
- Testing: Foundry + `@openzeppelin/contracts@5.4.0`
- Solidity test coverage: 20 unit/fuzz tests plus 3 handler invariants and 2 smoke tests; eight unit/fuzz cases were added on 14 November 2026 and **have not yet run without Foundry**
- License: MIT for code; VirgoStars marks and identity are not licensed for impersonation (see [NOTICE](NOTICE))

**Dependency integrity:** The committed npm lockfile pins `@openzeppelin/contracts@5.4.0` to a reviewed SHA-512 digest. The dependency-policy checker also enforces the exact `engines: {"node": ">=20"}` requirement in both `package.json` and the root lockfile entry; missing, weakened or extended engine declarations are rejected. The repository also sets `ignore-scripts=true` in `.npmrc` and pins the reviewed npm commands in the lock-policy checker. Use this order in a clean checkout, **before running any npm script**:

```bash
bash scripts/bootstrap-deps.sh
bash scripts/verify-local.sh
```

`scripts/bootstrap-deps.sh` checks the package policy before calling npm and enforces `npm ci --ignore-scripts`. The local verification gate also checks the policy **before any npm script**, removes inherited `NODE_OPTIONS` / `npm_config_node_options` values, and explicitly uses `npm --node-options='' --ignore-scripts run test:offline`. `npm ci --ignore-scripts` disables install-time lifecycle scripts even if npm's configuration was altered. The Node policy check catches unexpected npm hooks, script-command drift, overrides, extra package metadata and changes to `.npmrc`. Its **38/38 local tests passed**, including actual offline npm installations in isolated, dependency-free fixtures. Do not mistake this for a verified OpenZeppelin installation or Solidity compilation. Upgrades and approved script changes must update the explicit review policy.

The verifier explicitly selects `/bin/sh` for npm's script runner so inherited `npm_config_script_shell` and user/global `script-shell` settings cannot substitute an executable. The local tests exercise this with a harmless custom-shell marker. These entrypoints guard against npm lifecycle hooks and inherited Node preload options, but **cannot make an untrusted local shell, PATH, npm/Node binary or `BASH_ENV` safe**. Run them in a trusted, clean environment.

**Local verification gate:** After installing Node.js, Foundry and dependencies, use `bash scripts/verify-local.sh` (Bash/WSL2), not plain `npm run verify:local`: an unreviewed pre-run hook could execute before npm invokes the verifier if local npm configuration has been overridden. This first checks the reviewed `foundry.toml` profile with `node scripts/check-foundry-config.mjs` (compiler 0.8.24, minimum fuzz/invariant campaign configuration, no additional RPC/fork profiles), then runs offline tests, a fresh Forge build, compiled ABI checks, the Solidity suite, and a strict invariant-campaign evidence check. The profile check validates configuration **text only**, not an installed compiler or actual Forge execution. It **does not deploy** or authorize issuing tokens. All Forge build/test stages use **`--offline`** and require the configured Solidity compiler to be installed locally; they do not fetch compiler versions during verification. **Latest complete offline validation (14 November 2026): 163/163 passed**, exit code 0, on the source-verified local reconstruction with the three newly changed files matched to GitHub blob hashes. Two additional real-npm tests reproduce and block inherited `script-shell` command injection. This includes npm lifecycle, dependency-lock, ABI, testnet guard, RPC validation, synthetic Foundry output parsing, and mock verification-stage checks. This was not a full Git clone. Real Solidity compilation, compiler-derived ABI inspection and Foundry unit/fuzz/invariant campaigns **remain unrun** (Forge/solc unavailable); see [prototype validation status](docs/PROTOTYPE.md).

The initial supply is not chosen and no on-chain address has been assigned. Do not treat any `SPICA` token shown elsewhere as official.

## Tokenomics and governance research

No supply, allocation percentages, wallet addresses, or final treasury signer arrangement have been chosen. The non-deployable draft is [`config/tokenomics.draft.json`](config/tokenomics.draft.json).

- [Tokenomics and treasury governance](docs/TOKENOMICS_GOVERNANCE.md)
- Offline draft validation: `npm run check:tokenomics`
- Independent Node tests: `npm run test:tokenomics`
- This is **planning only**, not approval to issue, sell, distribute or trade SPICA.

## Contributor grant review (offline, no payouts)

The [contributor grant design](docs/CONTRIBUTOR_GRANTS.md) introduces a review-only validator for hypothetical open-source contributions. Entries reference GitHub pull requests and a separate **proposed** contributor allocation. Nothing is granted or distributed automatically; GitHub evidence is not fetched or verified by the validator.

- Empty default: `config/contributor-grants.draft.json` (no beneficiaries, amounts or addresses)
- Check draft: `npm run check:grants`
- Run 37 deterministic tests: `npm run test:grants`
- All offline checks including the Bash deploy-guard suite: `npm run test:offline`
- Windows PowerShell / cross-platform **Node-only** suite: `npm run test:offline:node` (requires Node.js 20+; runs every `test/node/*.test.mjs` test plus all four checked-in draft validation CLIs, without Bash). This **does not** run the shell deployment guard, compiled ABI check, Solidity/Foundry tests, or any audit. Run the omitted gates separately before approving a release.
- The Node-only runner refuses to report success if any of the 18 mandatory Node regression suites is missing or renamed; it also rejects case-colliding test filenames. New `test/node/*.test.mjs` suites run automatically, but security-critical new suites must also be added to `REQUIRED_NODE_TESTS` in `scripts/run-offline-node.mjs`. This is a completeness guard, not source integrity or authenticity verification.
- **Not** a token-for-AI-compute program; **not** usable to buy VirgoStars AI credits.

## Reference vesting tests (research only)

Our [OpenZeppelin VestingWallet research](docs/VESTING_REFERENCE.md) includes six Solidity tests for the standard vesting schedule, not a new deployable vesting contract. Ownership remains transferable and late deposits can unlock immediately. No real token or payments exist.

Run `npm run test:vesting` on a configured Foundry machine (not yet executed here).

## Cross-batch reward proposal accounting

The [offline grant batch reconciler](docs/GRANT_BATCH_RECONCILIATION.md) catches repeated PR evidence across independent proposal files and proposed totals that exceed one contributor allocation. It performs **no payment**, GitHub verification, wallet interaction or authorization.

- `npm run check:grant-batches` — check the default **empty draft** only
- `npm run test:grant-batches` — run synthetic cross-batch regression tests

Standalone `check:tokenomics`, `check:grants` and `check:grant-batches` use the same strict JSON decoder as the pinned-manifest review. Every JSON input (including companion tokenomics files) is read through the descriptor-backed reader, limited to **1 MiB per file**, and rejects symlink aliases. When either standalone grant CLI receives an optional tokenomics file, it **validates that companion plan even when the grant input is an empty draft**, refusing unsafe deployment flags or AI-credit conversion rather than silently ignoring it. The exported contributor-grants validator now enforces the same rule for direct library calls and batch reconciliation; a supplied valid economic plan is never token issuance approval. Standalone inputs are **not** SHA-256-authenticated. Use `npm run test:strict-cli-json` for CLI regression coverage. The multi-batch CLI also rejects multiple path aliases or hard links for the same physical batch (where inode identity is available); run `npm run test:batch-identity` for filesystem regressions.

## Hashed grant proposal manifest (review-only)

The [SHA-256 manifest integrity check](docs/GRANT_MANIFEST_INTEGRITY.md) detects modified batch files, rejects duplicate physical batch aliases (including supported hard links), and requires a versioned, explicit list of the proposal files being reconciled. It **cannot prove** that no batch was intentionally omitted, that any GitHub contribution is eligible, or that token issuance is authorized.

- `npm run check:grant-manifest` — validate the committed empty draft and its exact checksum
- `npm run test:grant-manifest` — run synthetic integrity and safety tests
- `npm run test:review-json` — reject duplicate keys, malformed UTF-8, lone Unicode surrogates and ambiguous grant-review JSON; verify file hashes before parsing
- `npm run test:grant-inventory` — check for unlisted JSON batches and unsafe directory paths
- `npm run test:proposal-cli-integration` — test real tokenomics and grant validators with synthetic proposals, including cross-batch budget and duplicate PR protections and validation of optional economics on empty drafts
- `--inventory-dir review-batches` (CLI option) — verify every lowercase `.json` file in a dedicated flat review folder is listed; reject nested folders, symlinks and case-variant `.JSON` extensions; abort if the folder contains more than 128 total entries
- `--expected-manifest-sha256 <digest>` (CLI option) — independently pin the **raw manifest** for a read-only review; SHA-256 is not a signature or issuance authorization

- `--pinned-proposal-review` (optional CLI mode) — fail with usage error unless `--require-proposal`, `--inventory-dir` and `--expected-manifest-sha256` are all present. Intended to avoid accidentally skipping a review safeguard; it is **not** an approval or evidence that the supplied digest came from an independent reviewer.

**Consolidation note (14 Nov 2026).** This combines the grant-review and tokenomics research stack with the newer, more restrictive ERC-20 tests and local safety checks. The previous **163/163** offline result covers the ERC-20 prototype snapshot only. The newly combined grant/review suite, Solidity compilation, vesting tests, real fuzz/invariant campaigns and an independent audit are **not verified**; no supply, wallet, treasury signer or deployment is approved.

**Portable Node verification (experimental):** `npm run test:offline:node` now refuses to run if any of the **18** checked-in baseline Node regression suites is missing. It also rejects case-variant `.test.mjs` suffixes and case-insensitive filename collisions, while still discovering additional canonical suites. This does not replace the Bash guards, Foundry tests, or a complete clean-checkout test run.

## Roadmap

1. Agree on the security model, token economics and legal requirements; check name/ticker collisions.
2. Review minimal ERC-20 prototype and unit/fuzz tests; add stateful invariants and complete offline validation.
3. Publish governance, vesting and distribution rules; obtain external security review.
4. Run a public testnet pilot with no real economic value.
5. Decide whether and when a compliant mainnet launch makes sense.

## Documentation

- [Launch readiness and open tasks](docs/LAUNCH_READINESS.md) — 17 unresolved, evidence-gated engineering, economic, testnet, legal and launch tasks. A consolidated Git history is not release verification.
- [Portable offline Node evidence capture](docs/OFFLINE_EVIDENCE.md) — Windows 11 / PowerShell instructions for read-only Git/source-hash provenance, dependency-policy preflight and Node-suite stdout/stderr evidence. Eight isolated fixture tests passed; **not** Foundry, browser, security audit or launch approval.
- [Local EVM demonstration (Windows/WSL2)](docs/LOCAL_DEMO.md) — sample ERC-20 deployment, balances, transfer, approval, delegated transfer and revoked approval using disposable synthetic accounts. Source prepared; real Forge execution pending.
- [Standalone Windows offline viewer](docs/LOCAL_VIEWER.md) — double-click `demo/index.html` to step through fictional Alice/Bob transfers, delegated allowances and rejection, with no server or wallet. This is a mathematical simulation, not EVM execution or a live coin.
  - Optional Windows Chrome/Edge smoke verification: `node scripts/check-viewer-browser.mjs` (real browser required; no wallet, RPC or deployment). The Node-only offline tests remain browser-independent.
- [Value proposition and falsification criteria](docs/VALUE_PROPOSITION.md) — proposed differentiation, evidence needed for non-speculative demand, comparisons to alternatives and reasons **not** to issue a token.

- [Network evaluation](docs/NETWORK_EVALUATION.md) — research, trade-offs and references.
- [Token design](docs/TOKEN_DESIGN.md) — pending decisions and security checklist.

- [Developer/AI agent guide](AGENTS.md) — safe contributor workflow.

## Security

Never commit mnemonic phrases, private keys, seed phrases or provider secrets. No GitHub Actions are used for automatic deployment; deployments require explicit human approval.

## License

The prototype code and repository documentation are under the [MIT License](LICENSE). Third-party OpenZeppelin code uses its own MIT license. **VirgoStars branding and official token identity are not part of the software license.** See [NOTICE](NOTICE).
