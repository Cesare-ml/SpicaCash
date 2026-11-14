# Reference vesting tests (experimental, no deployment)

> **No official SPICA token has been deployed. No real vesting contract, award, grant or token distribution exists.** This branch only tests the semantics of an existing standard library for future design reviews.

## Purpose

The [contributor grant proposal system](CONTRIBUTOR_GRANTS.md) provides a **review-only, off-chain validation tool** that links proposed grants to a separately reviewed contributor allocation budget. This work adds *no parallel grant ledger*. It only provides an optional on-chain vesting research test suite.

Rather than designing an unreviewed vesting contract, `test/SpicaVesting.t.sol` exercises `@openzeppelin/contracts@5.4.0`'s standard [VestingWallet](https://docs.openzeppelin.com/contracts/5.x/api/finance) directly, with a new `SpicaCash` instance minted solely inside the local test environment.

## What the Foundry tests try to prove

1. Tokens are unreleasable before the configured start time.
2. Exactly half of an *illustrative* linear grant is releasable halfway through the schedule; the full balance is releasable at the end.
3. Calling `release` repeatedly at the same time cannot pay twice.
4. Late contributions to an already-running vesting wallet are **partly releasable immediately**. This is an operational risk, not a recommended funding pattern.
5. The wallet owner/beneficiary can transfer ownership, changing who receives remaining tokens. **Do not describe this mechanism as non-transferable.**
6. Fuzzed elapsed time cannot cause a release greater than the amount funded.

**All example times and amounts are fictional:** the 90-day duration, 900-token fixture and addresses used in the test are not approved allocations, cliffs, a supply decision or any promised contributor compensation.

## Critical limitations

- No cliff is included in the standard linear `VestingWallet` tested here. A future cliff, if desired, needs a separate reviewed design and tests.
- Transfers of vesting ownership can transfer economic rights to unvested tokens. A project claiming rights are locked *to a particular person* must consider this.
- Transfers of additional SPICA into a vesting wallet after its start can cause retroactive vesting immediately.
- It is not sufficient to create an onchain vesting wallet: verify its funding, monitoring, beneficiary/account-recovery policy, threat model and exact schedule.
- OpenZeppelin's library is a building block. **This test is not an independent security audit.**
- The draft grants validator does not prove that GitHub PR evidence is real or eligible; human reviewers must verify it.
- No conversion to VirgoStars AI credits, token sale, token launch, owner wallet, or automated payout is authorized.

## Local validation

Requires Node 20+ and a working installation of Foundry and the pinned OpenZeppelin dependency:

```bash
npm install
npm run test:vesting
npm run test:grants
```

`test:vesting` executes `forge test --match-contract SpicaVestingTest -vv`.
Actual Solidity compilation and Foundry tests have **not** been run in this environment: Foundry is not installed and npm dependency retrieval failed. Do not merge or claim passing Solidity tests until Codex or a local checkout completes these commands and documents exact output.

## Release gates

No token or vesting wallet deployment is part of this PR. Any later testnet rehearsal requires an independent explicit instruction. Actual rewards additionally require reviewed tokenomics, verified contributor eligibility, appropriate custody and legal/security review. Mainnet remains a separate future decision.
