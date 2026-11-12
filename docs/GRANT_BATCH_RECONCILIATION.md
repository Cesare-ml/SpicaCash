# Offline reconciliation of proposed contributor grant batches

**Research only. No SPICA has been issued, no grant has been awarded, and no transaction or payment is authorized.** This is a read-only check for *hypothetical* reward proposal files, not an allocation decision or a replacement for independent review.

## Why

The per-document [contributor grants validator](CONTRIBUTOR_GRANTS.md) checks a proposal against an allocation budget. **Two individually valid proposal files may exceed the budget when combined** or reuse the same GitHub PR as supposed evidence. The new batch reconciliation step looks across files without connecting to a wallet, GitHub API, signing key, DEX, token contract or VirgoStars production systems.

## Controls

- Validates every input file with the existing `validateContributorGrants` and one shared tokenomics proposal; each proposal must reference a `contributors` allocation.
- Sums exact positive integer base-unit amounts using JavaScript `BigInt` **per contributor bucket**. Catches cumulative over-allocation even if each file passes separately.
- Refuses repeated grant IDs or canonical PR references **across files**; PR comparisons are case-insensitive.
- Refuses duplicate file names, unknown batch wrapper fields, missing plans and inconsistent draft/proposal mixtures.
- Allows inspection of the existing **empty draft** with no tokenomics selection, but a draft is never a funding reservation. `--require-proposal` rejects it.
- Limits each run to 64 batch files and 10,000 proposed entries. The per-file validator separately caps each file at 1,000 grants.
- Always emits **not approved** warnings; success means only syntactic and arithmetic consistency.

## Commands

Requires Node.js 20+. No npm dependency or network access is needed for the offline checks.

```bash
# Validates the empty default draft; makes NO allocation
npm run check:grant-batches

# A future synthetically populated local review scenario:
node scripts/check-grant-batches.mjs \
  --tokenomics path/to/tokenomics-proposal.json \
  --require-proposal \
  path/to/grants-batch-a.json path/to/grants-batch-b.json

# Regressions (synthetic fixtures only)
npm run test:grant-batches
```

The proposed amounts and temporary IDs used in tests are **not** authorized SPICA tokenomics. A successful output may include per-bucket proposed and unassigned **base units**. This must never be described as issued, reserved, payable, vested or legally earned.

## Important gaps

- **No GitHub verification:** a canonical PR URL is not proof of contribution ownership, accepted code, approval, independent reviewers, identity uniqueness or absence of Sybil attacks.
- **No persistent global ledger:** the checker only reconciles files passed to one invocation. A reviewer must include **every** proposal batch belonging to the same allocation before treating arithmetic as complete. Running one batch alone cannot detect duplicates in omitted files.
- **No transaction verification:** previous real distributions, treasury balances, actual vesting wallets and blockchain events are **not** checked.
- **No real economics:** total supply, allocation sizes, release policy, signers and jurisdiction-specific review are undecided.
- **No deployment authorization:** the CLI has no address, private key or signer input, and never broadcasts a transaction.
- **No AI credit conversion:** SpicaCash remains independent of the initial VirgoStars AI credit product.

## Optional pinned manifest

The [SHA-256-pinned manifest](GRANT_MANIFEST_INTEGRITY.md) provides an explicit versioned file list and digest verification **before** performing this arithmetic. The manifest cannot prove that a contributor batch was intentionally omitted or that a GitHub PR is genuine. Run `npm run check:grant-manifest` for the committed, empty draft.

## Human review gates

1. Agree a canonical, versioned proposal manifest including every batch in scope; define immutable public evidence for acceptance/eligibility.
2. Require independent quality and conflict-of-interest review before considering any distribution.
3. Approve supply, treasury, allocation rights, vesting design, taxes and MiCA/legal classification before financial activity.
4. Review security and test output in a clean checkout; any future on-chain actions require separate explicit approval.
5. Keep all SpicaCash features entirely separate from VirgoStars AI-credit purchases in the initial release.

## Validation status

Fourteen direct, isolated JavaScript reconciliation scenarios were run at implementation time: two valid draft/complete cases, exact-budget and independent-bucket cases accepted; invalid duplicate, over-budget and authorization conditions rejected. The committed Node test runner and CLI integration **still require execution in a checked-out repository**. No Foundry tests or deployments were run in this workstream.
