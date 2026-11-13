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

The initial Solidity implementation, unit/fuzz test suite and guarded Arbitrum Sepolia helper are in a draft development branch, **not released or deployed**.

- [Prototype and local instructions](docs/PROTOTYPE.md)
- Contract: `src/SpicaCash.sol` (simple fixed supply, no owner or privileged minting)
- Testing: Foundry + `@openzeppelin/contracts@5.4.0`
- License: MIT for code; VirgoStars marks and identity are not licensed for impersonation (see [NOTICE](NOTICE))

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
- All offline checks: `npm run test:offline`
- **Not** a token-for-AI-compute program; **not** usable to buy VirgoStars AI credits.

## Reference vesting tests (research only)

Our [OpenZeppelin VestingWallet research](docs/VESTING_REFERENCE.md) includes six Solidity tests for the standard vesting schedule, not a new deployable vesting contract. Ownership remains transferable and late deposits can unlock immediately. No real token or payments exist.

Run `npm run test:vesting` on a configured Foundry machine (not yet executed here).

## Cross-batch reward proposal accounting

The [offline grant batch reconciler](docs/GRANT_BATCH_RECONCILIATION.md) catches repeated PR evidence across independent proposal files and proposed totals that exceed one contributor allocation. It performs **no payment**, GitHub verification, wallet interaction or authorization.

- `npm run check:grant-batches` — check the default **empty draft** only
- `npm run test:grant-batches` — run synthetic cross-batch regression tests

Standalone `check:tokenomics`, `check:grants` and `check:grant-batches` now reject duplicate JSON keys (including escaped aliases), malformed UTF-8, leading BOM and excessive JSON nesting using the same strict parser as the pinned-manifest path. All three commands also read through the shared descriptor-backed, 1 MiB-bounded reader and reject symlinked inputs, including companion tokenomics JSON. These standalone commands **do not pin SHA-256**; use an independently pinned manifest and strict inventory for grant-review authenticity.

## Hashed grant proposal manifest (review-only)

The [SHA-256 manifest integrity check](docs/GRANT_MANIFEST_INTEGRITY.md) detects modified batch files and requires a versioned, explicit list of the proposal files being reconciled. It **cannot prove** that no batch was intentionally omitted, that any GitHub contribution is eligible, or that token issuance is authorized.

- `npm run check:grant-manifest` — validate the committed empty draft and its exact checksum
- `npm run test:grant-manifest` — run synthetic integrity and safety tests
- `npm run test:grant-inventory` — check for unlisted JSON batches and unsafe directory paths
- `--inventory-dir review-batches` (CLI option) — verify every lowercase `.json` file in a dedicated flat review folder is listed; reject nested folders, symlinks and case-variant `.JSON` extensions
- `--expected-manifest-sha256 <digest>` (CLI option) — independently pin the **raw manifest** for a read-only review; SHA-256 is not a signature or issuance authorization
- `npm run test:safe-reader` — bound and verify descriptor-backed local file reads
- `npm run test:review-json` — reject duplicate grant-review JSON keys, malformed UTF-8, leading BOM, and pathological nesting
- `npm run test:strict-cli-json` — exercise strict decoding across standalone tokenomics, contributor-grants and batch CLIs

## Roadmap

1. Agree on the security model, token economics and legal requirements; check name/ticker collisions.
2. Review minimal ERC-20 prototype and unit/fuzz tests; add stateful invariants and complete offline validation.
3. Publish governance, vesting and distribution rules; obtain external security review.
4. Run a public testnet pilot with no real economic value.
5. Decide whether and when a compliant mainnet launch makes sense.

## Documentation

- [Network evaluation](docs/NETWORK_EVALUATION.md) — research, trade-offs and references.
- [Token design](docs/TOKEN_DESIGN.md) — pending decisions and security checklist.

- [Developer/AI agent guide](AGENTS.md) — safe contributor workflow.

## Security

Never commit mnemonic phrases, private keys, seed phrases or provider secrets. No GitHub Actions are used for automatic deployment; deployments require explicit human approval.

## License

The prototype code and repository documentation are under the [MIT License](LICENSE). Third-party OpenZeppelin code uses its own MIT license. **VirgoStars branding and official token identity are not part of the software license.** See [NOTICE](NOTICE).
