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
- For Solidity changes, run `npm run verify:local` on a machine with Foundry and local OpenZeppelin dependencies before reporting a verified PR. It checks the compiled ABI and requires three real invariant campaigns (at least 64 runs and 4096 calls each, zero reverts) plus two smoke tests. Inspect `move`, `approve`, and `pull` selector metrics manually; a transcript parser is not proof of a genuine forge binary or audit.
- The local Solidity verification gate must call **all** Forge build and test commands with `--offline`, with Solidity compiler 0.8.24 preinstalled, so verification cannot fetch compilers or use an accidental RPC. The mocked test gate must reject omission of this flag.
- The Foundry evidence checker must fail closed if any invariant lacks the expected per-selector metrics table or if `move`, `approve`, or `pull` was never invoked, reverted, was discarded, or has inconsistent call totals. This automated guard complements, but does not replace, inspecting actual Foundry output and independent review.
- When changing `verify:local` or the Forge output parser, run `npm run test:foundry-evidence` and `npm run test:local-gate`. Also run `npm run test:foundry-format`; official Foundry output may contain separator rows between metrics entries and the parser must ignore only pure drawing rules, never malformed metric rows. Passing these mock/synthetic checks never replaces live Solidity compilation, full Forge tests, or manually inspected handler selector metrics.
- If Foundry is missing, report `verify:local` as **blocked**, even if `npm run test:offline` succeeds. The local gate never deploys, signs, calls RPCs, or enables GitHub Actions.
- For financial/security-sensitive changes, request review; provide exact tests actually run. Never claim an audit based on self-tests.

## Pull request checklist

- State the goal, threat-model impact, and exact files changed.
- Document the chain/network and why a dependency is needed.
- Add relevant tests; report the actual local test commands and outcomes.
- Identify any untested path or security assumption.
- Link a design decision if altering supply, permissions, vesting, wallets or token economics.
- No merge of issuance or production-signing changes without separate approval.

## Legal and project identity

The codebase is for technical exploration, not an offer or recommendation to acquire any asset. Token issuance, public distribution, and exchange admission require a tailored review of applicable legal obligations, including MiCA where relevant. The prototype branch proposes the MIT License for source code; preserve the copyright notices. The VirgoStars brand remains distinct from the software license.
