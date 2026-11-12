# Contributor grant proposals (offline v0)

> **Research infrastructure, not an awards program.** SpicaCash is not deployed, has no official address, and no real grants, supply, allocation, reward scheme or vesting contract have been authorized. **Do not send funds or tokens based on this document.** VirgoStars AI credits are separate from SPICA.

## Purpose and boundaries

The offline validator lets reviewers examine *hypothetical* allocations for accepted open-source contributions without storing wallets, signing transactions or involving VirgoStars user accounts. It does not authenticate GitHub, verify that a pull request was merged, detect Sybil identities, adjudicate work quality, reserve a treasury balance or enforce vesting onchain. Every proposed entry must receive independent human, legal and security review before any eventual distribution process is designed.

This is **not** a program paying people for running their AI, keeping tabs open, producing raw prompts, or generating unreviewed code. Public project contributions can remain completely unpaid and require no cryptocurrency wallet.

## Data model

The file at config/contributor-grants.draft.json is intentionally empty. The offline status may be draft (no grants, no allocation chosen) or proposal (review-only). All three booleans must remain false: deploymentApproved, distributionEnabled and aiCreditConversionEnabled. Unknown fields are rejected, including addresses, signing or auto-payout instructions.

A synthetic proposal entry has the following shape. **No example values are actual SPICA allocation terms:**

    {
      "id": "reviewed-example",
      "sourcePullRequest": "https://github.com/example-org/example-repo/pull/12",
      "amountBaseUnits": "1000000000000000000",
      "rationale": "Example only: independent maintainers would evaluate delivered work.",
      "vestingMonths": 24,
      "cliffMonths": 6
    }

The grants document selects tokenomicsBucketId, which must refer to an allocation with category "contributors" in a **separate complete tokenomics proposal**. This link is only an offline consistency check; a PR URL is documentary evidence, **not** a signature or proof of acceptance. A contributor has no guaranteed entitlement to tokens because a record passes validation.

## Offline checks

- Uses exact positive decimal strings in **18-decimal token base units**, with uint256 overflow protection. No floats.
- Requires unique grant IDs and unique canonical GitHub PR URLs (case-insensitive duplicate check), a sufficiently detailed rationale, and positive vesting duration (1–120 months) with a cliff between 0 and duration.
- Checks that combined proposed grants do not exceed the selected contributor-category allocation; they need not exhaust it. Caps records at 1,000 per document.
- Requires the companion tokenomics proposal to pass the existing tokenomics validator with requireProposal=true first; plans that are merely drafts cannot fund grant proposals.
- **Does not** prevent double-counting across separate files, verify outside evidence, compute an onchain vesting schedule or perform any execution. No default cliff or approved vesting length is assumed.

## Commands

Run with Node 20 or newer, without installing dependencies:

    node scripts/validate-contributor-grants.mjs config/contributor-grants.draft.json
    node scripts/validate-contributor-grants.mjs config/contributor-grants.draft.json --require-proposal
    node scripts/validate-contributor-grants.mjs path/to/grants-proposal.json --tokenomics path/to/tokenomics-proposal.json --require-proposal
    node --test test/node/contributor-grants.test.mjs

The second command **must fail**, because the default document is only a draft. A complete **synthetic** test proposal is constructed inside the test suite. The CLI prints a non-authorization warning even for a structurally valid proposal.

## Batch aggregation

The [grant batch reconciler](GRANT_BATCH_RECONCILIATION.md) checks multiple hypothetical proposal files against a shared contributor budget and detects duplicate grant IDs and GitHub PR references **across supplied files**. It does not verify external evidence or detect omitted files.

## Human and governance gates before any real reward

1. Decide whether grants should exist at all; document eligible public work and exclude automated self-approval.
2. Require traceable merged/accepted PRs, independent review, anti-Sybil and conflict-of-interest checks, dispute/appeal process and fair attribution for group work.
3. Review economic and tax/legal implications (including applicable EU requirements). Never publish sensitive contributor identities or wallet details in this repository.
4. Decide vesting and deploy **separately reviewed** contracts only after a security audit; proposed months are not an executable release calendar.
5. Ensure a canonical, non-overlapping accounting register across all grant batches before any issuance is authorized.
6. Obtain separate explicit authorization for any later testnet or mainnet action. No production integration, transfers, automated signing or token-to-AI-credit conversion in this milestone.
