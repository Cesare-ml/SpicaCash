# SpicaCash — tokenomics and treasury governance (design v0)

> **Proposal infrastructure only.** SpicaCash has not been deployed. No real token exists, there is no official contract address, and this document is not an offer, investment prospectus or token sale. All values, allocations, vesting terms and signer identities remain **undecided**.

## Non-negotiable product boundaries

- SpicaCash is the proposed official cryptocurrency associated with the VirgoStars open-source ecosystem.
- **VirgoStars AI credits remain independent**. No token-to-credit conversion, credit purchases using SPICA, discounts, or automatic redemption in v1.
- Do not require cryptocurrency to use VirgoStars Desktop, its open-source tools, or the existing VirgoStars services.
- No speculative performance claims, guaranteed appreciation, promised income, or rewards merely for running an AI process.
- No external wallet handling, public sale, real rewards distribution, DEX liquidity or bridge integration in the present milestone.

## Design questions (not yet decisions)

1. **Supply** — fixed supply value in 18-decimal base units, issuance rationale, and independent review of numerical magnitude and token divisibility.
2. **Chain** — Arbitrum One is the current candidate; Base remains an alternative. Only one canonical chain in the first release.
3. **Allocation** — proportions and rationale for ecosystem, community, contributors, treasury, team and optional liquidity or other purposes. These are possible categories, **not** allocation commitments.
4. **Vesting** — concrete schedules, smart contracts, cliff, commencement and revocation policy. Team allocations require a reviewed onchain vesting policy before they can be proposed in the validator.
5. **Treasury** — initial token recipient, security model, multisignature owners, independent co-signers, quorum, replacement and recovery procedures. The initial holder in the ERC-20 constructor should not be an individual's everyday wallet.
6. **Rights and governance** — clarify whether holding SPICA confers any formal voting, redemption, service, or economic rights; presently none are promised.
7. **Contributor recognition** — accepted contributions, duplicate-detection, conflicts of interest, identity/Sybil defenses, appeal process and public accounting before any real-value rewards.
8. **Legal and financial review** — Italy/EU MiCA scope and obligations, token classification, marketing, potential tax duties, sanctions/AML obligations where applicable, open-source attribution and name/ticker conflicts.
9. **Launch authorization** — who can approve mainnet deployment, testnet deployment, initial allocation, treasury transactions and public communications; no automated deployment authority.
10. **Trust and audit** — external audit, independent inspection of deployed bytecode and addresses, supply verification, treasury monitoring, emergency response.

## Machine-readable plan (offline, review-only)

The repository contains [`config/tokenomics.draft.json`](../config/tokenomics.draft.json) with **no supply, allocations or signer policy selected**.

Use:

```bash
node scripts/validate-tokenomics.mjs config/tokenomics.draft.json
node scripts/validate-tokenomics.mjs config/tokenomics.draft.json --require-proposal
node --test test/node/tokenomics.test.mjs
```

Expected behavior: The first command accepts the **empty draft** and says it is not approved for deployment. The second **intentionally fails** because the draft is incomplete. The test command exercises synthetic proposals; its numbers are NOT VirgoStars tokenomics.

### Draft-versus-proposal safety boundary

- A `draft` must keep `token.totalSupplyBaseUnits: null`, `allocations: []` and `treasury.status: "undecided"` with null signer fields. Changing these fields requires explicitly changing the document to `status: "proposal"` for review.
- Either status may record `network.candidate` as provisional research. This is not a chain selection or approval.
- A `proposal` must provide exact positive base-unit amounts, fully balancing allocations, and a proposed multisig policy. The validator does not judge whether those choices are economically fair or legally compliant.
- Amounts must be canonical decimal integer strings within the EVM `uint256` range (at most 78 digits); oversized strings are rejected before BigInt conversion.
- The validator cannot approve deployments, sales, distributions, or VirgoStars AI-credit conversion, even with `reviews.security` and `reviews.legal` set to `completed`. Review labels are self-reported planning metadata, **not evidence of completed audits**.


A future review proposal uses `status: "proposal"` and supplies:
- `token.totalSupplyBaseUnits` as an exact **integer string**, because JSON floating-point numbers can lose precision;
- `allocations[]` with unique IDs, category, exact base-unit amount, rationale, and explicit vesting policy/months;
- `treasury.status: "proposed"` with proposed signer count and approval threshold (current safety-validation policy: at least 3 signers and at least 2 approvals);
- `network.candidate` as a researched candidate only, not chain authorization;
- `reviews.security` and `reviews.legal` progress disclosures.

The validator checks that proposed allocations add up **exactly** to the total supply, that no unit exceeds EVM `uint256`, and that team buckets have onchain vesting. It rejects unknown fields, proposed mint/deployment approval, sales flags and VirgoStars AI-credit conversion.

**A numerically valid proposal is not safe, approved, legal or ready for launch.** There is deliberately no `approved` status, no address/signing/private-key field, no direct wallet transaction and no deployment API in this tooling.

## Treasury operating policy to decide

A multisignature treasury is the preferred approach, but addresses and signer identities must **not** be published here prematurely. A treasury design review should cover:

- Independent signer control (separate people/devices, preferably hardware/offline keys), signer eligibility and conflict-of-interest checks.
- Approval quorum, transaction simulation, review period, large-spend escalation, public transaction rationale and reporting cadence.
- Lost-key replacement, compromised signer response, succession and account recovery.
- Segregation of treasury reserve from time-locked team/contributor grants; initial holder must not bypass published vesting commitments.
- Verifiable, periodically reconciled treasury allocation and distribution records.
- No unilateral backdoor minting, arbitrary contract upgrades, or implicit SPICA-to-credits exchange rate.
- Publicly documented authorized operations only after legal and external security reviews.

## Release gates

| Gate | Requirement | Status |
| --- | --- | --- |
| G0 | Draft governance plan + offline validator | In progress (this branch) |
| G1 | Contract compilation, unit/fuzz/invariant tests and reproducible dependency lock | Not completed |
| G2 | Tokenomics, vesting and multisig policy reviewed and approved | Not completed |
| G3 | Independent security assessment and legal review | Not completed |
| G4 | Explicitly approved public testnet trial with verified bytecode | Not completed |
| G5 | Explicitly authorized compliant mainnet deployment and communications | Not completed |

**Never merge this document as if G2–G5 were completed.**

## Separation from other VirgoStars repositories

Do not make token contract code a dependency of the ephemeris, charting, functions or desktop libraries. Any eventual integration must be optional and reviewed as a separate workstream. Developers can contribute without wallets or payments.
