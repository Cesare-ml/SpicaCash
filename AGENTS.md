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
- Do not connect SpicaCash to VirgoStars AI credits, credit purchases, conversions or checkout in the initial release.
- Prefer minimal and verifiable standard-contract components; no fee-on-transfer, hidden mint functions, owner blacklists or speculative marketing claims.
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
- Grant proposals require a separate validated tokenomics proposal with a contributors-category allocation.
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
- For review proposals, use `--inventory-dir <relative-folder>` with a dedicated flat batch directory to detect omitted local JSON files. Nested folders, symlinks, special filesystem entries and case-varied `.JSON` extensions fail; use lowercase `.json` only. Verify externally that the directory is the canonical complete inventory; no local scan can prove it alone.
- Preserve descriptor-bound and maximum-1-MiB reads in `scripts/read-small-file.mjs` for every manifest and referenced JSON file. Retain POSIX `O_NOFOLLOW`, supported `O_NONBLOCK`, the one-byte overflow probe, and before/after descriptor metadata checks; never weaken fail-closed behavior without regression tests. Windows inode checks and all metadata checks are only best effort: do not claim a complete TOCTOU defense or an atomic directory snapshot.
- Run `npm run test:safe-reader`, `npm run test:grant-manifest`, `npm run test:grant-inventory` and `npm run check:grant-manifest` after modifications.

## Pull request checklist

- State the goal, threat-model impact, and exact files changed.
- Document the chain/network and why a dependency is needed.
- Add relevant tests; report the actual local test commands and outcomes.
- Identify any untested path or security assumption.
- Link a design decision if altering supply, permissions, vesting, wallets or token economics.
- No merge of issuance or production-signing changes without separate approval.

## Legal and project identity

The codebase is for technical exploration, not an offer or recommendation to acquire any asset. Token issuance, public distribution, and exchange admission require a tailored review of applicable legal obligations, including MiCA where relevant. The prototype branch proposes the MIT License for source code; preserve the copyright notices. The VirgoStars brand remains distinct from the software license.
