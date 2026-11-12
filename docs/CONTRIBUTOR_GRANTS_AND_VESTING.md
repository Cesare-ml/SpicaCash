# Contribution grants and vesting — experimental research

**No SPICA has been minted or distributed, and no vesting contract is deployed.**
This work provides **offline proposal validation** and **Solidity tests of a third-party vesting primitive**. It is not a payroll, grants, rewards or payment service.

## Off-chain contribution review

The initial [grant ledger](../config/grants.draft.json) is intentionally empty. Contributors must not need a cryptocurrency wallet to work on VirgoStars.

The proposed data model records:
- A pseudonymous grant ID and contributor ID; no names, wallet addresses, e-mails, API keys or secrets.
- A public GitHub repository name and PR number, from an allowed VirgoStars namespace.
- A human-supplied peer-review *proposal* with at least two distinct pseudonymous reviewers.
- A rationale, a proposed amount in exact decimal ERC-20 **base units**, and optional proposed linear vesting details.
- Flags that **must remain false** for automatic distribution and VirgoStars AI-credit conversion.

### Important limits

The validator checks **structure**, uniqueness, numeric safety and fields. It **does not check** if a GitHub PR exists, was merged, belongs to the claimed contributor, received independent review, or was eligible for an award. These must be checked independently from live repository evidence and a public review process before any proposal can become a decision.

"peer-review-proposed" is **not approved**. There is no "approved" state or transaction function. The validator rejects duplicate allocations of the same PR to the same contributor, while allowing a PR to have multiple different contributors. The allowed namespace is a convenience filter and cannot establish ownership or authenticity.

The file cannot authorize a wallet transfer or contract call. Do **not** import it into any signing/deployment pipeline.

### Offline usage

```bash
node scripts/validate-grants.mjs config/grants.draft.json
node scripts/validate-grants.mjs config/grants.draft.json --require-proposal
node --test test/node/grants.test.mjs
```

The first command accepts the *empty draft*. The second intentionally fails: the current file is not a review proposal. The third command tests both accepted and rejected **synthetic** scenarios, with fictional references only.

In particular, no amount is assigned until independently approved tokenomics exist, and the project must not infer award amounts from AI runtime duration, merge count, or unverified GitHub activity.

## Reference linear vesting implementation

Rather than inventing a new vesting algorithm, `test/SpicaVesting.t.sol` exercises the maintained OpenZeppelin `VestingWallet` from the existing pinned `@openzeppelin/contracts@5.4.0` dependency, using an independent synthetic test token. No new production contract, deploy script or owner privileges are introduced.

The tests cover:
- Zero releasable balance before vesting starts;
- Linear vesting halfway through the period, with complete release at the end;
- Repeated releases at the same timestamp cannot double-pay;
- Late funding after schedule start has an immediately releasable fraction;
- Ownership transfer changes who can receive future vested funds;
- Fuzzed timestamps cannot release more than the funded grant.

**Material security and governance trade-offs:**

- Standard `VestingWallet` ownership is transferable: the beneficiary can potentially sell rights to unvested tokens. The project must decide whether this is compatible with its governance policy. Do not describe this as non-transferable.
- Token transfers **after** the vesting start date participate retroactively: they can partially or fully unlock immediately. Production vesting would need controlled upfront funding, monitoring, and test/audit evidence.
- The standard schedule has **no cliff** by default. A cliff is a separate design decision; do not silently add one.
- Releasing tokens is permissionless, but payout is directed to the wallet's current owner.
- The test scenario's 90-day schedule and 900-token fixture are **not** proposed values for SpicaCash supply, team allocations or contributor payments.
- Using a third-party audited library is **not** a security audit of our deployment, tokenomics, custody or governance.

### Reproduction (Foundry must be installed)

```bash
npm install
forge test --match-contract SpicaVestingTest -vv
node --test test/node/grants.test.mjs
```

**Validation status:** the core grant validator was exercised through 15 direct pure JavaScript cases during development, with both valid fixtures accepted and 13 invalid ones rejected. The committed Node CLI/test runner and Solidity tests still need actual execution in a configured checkout. No live GitHub evidence, deployment or transaction was checked. See the draft PR for verification status.

## Review and release gates

1. Validate Node tests and all existing Solidity suites; pin a reproducible lockfile.
2. Independently confirm PR ownership, merge/evidence and impartial reviewer attestations (the current JSON alone is not evidence).
3. Define and approve real tokenomics, recipient rights, multisig governance, grant conditions, start/duration/cliff/revocation policy and recovery process.
4. Threat-model late funding, beneficiary transfers, treasury flows and any vesting factory; security audit before onchain use.
5. Complete EU/Italian legal review of crypto distributions, contractor/reward classifications and related obligations.
6. Separate explicit approval for testnet deployment; separate new approval for any mainnet issuance or payouts.
7. Keep all SpicaCash functionality outside VirgoStars AI-credit purchases in the first release.

### References

- [OpenZeppelin Contracts v5 VestingWallet](https://docs.openzeppelin.com/contracts/5.x/api/finance)
- [SpicaCash tokenomics and treasury governance](TOKENOMICS_GOVERNANCE.md)
