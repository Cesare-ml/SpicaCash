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

## Contributor grants and vesting

- Read `docs/CONTRIBUTOR_GRANTS_AND_VESTING.md` before adding or changing contributor allocation records or vesting tests.
- `config/grants.draft.json` **must** remain an empty, non-payable draft until authorized review evidence and tokenomics exist.
- Do not infer contributor identity, merge status, independent review or accepted amount from a JSON entry. Verify actual public GitHub evidence independently before describing any grant as eligible.
- No wallet addresses, personal details, payment credentials or automated payouts in the grant ledger.
- The Foundry vesting tests use fictional values and OpenZeppelin's standard `VestingWallet`. Do not describe its ownership rights as non-transferable or late funding as locked from deposit time.
- Do not create new token distribution, escrow or live vesting deploy scripts without separate explicit approval.

## Pull request checklist

- State the goal, threat-model impact, and exact files changed.
- Document the chain/network and why a dependency is needed.
- Add relevant tests; report the actual local test commands and outcomes.
- Identify any untested path or security assumption.
- Link a design decision if altering supply, permissions, vesting, wallets or token economics.
- No merge of issuance or production-signing changes without separate approval.

## Legal and project identity

The codebase is for technical exploration, not an offer or recommendation to acquire any asset. Token issuance, public distribution, and exchange admission require a tailored review of applicable legal obligations, including MiCA where relevant. The prototype branch proposes the MIT License for source code; preserve the copyright notices. The VirgoStars brand remains distinct from the software license.
