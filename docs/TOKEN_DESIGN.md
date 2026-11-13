# SpicaCash token design — proposal, not an issuance

Status: **open design**. Nothing here authorizes a mint, sale, exchange listing, launch, or deployment.

## Product boundary (agreed)

**SpicaCash is VirgoStars' cryptocurrency, not the VirgoStars AI-credit system.**

- VirgoStars AI credits remain an internal service metering/billing product; ordinary payment methods can fund them.
- **Do not** introduce a SpicaCash-to-credit purchase or conversion option in the initial VirgoStars website or desktop releases.
- Do not imply that holding SpicaCash grants AI credits, discounts, access, profit shares, or investment returns.
- Any future integration needs separate product, financial, security, and legal approval.

## Proposed v0 technical approach

- **Chain candidate:** Arbitrum One (Ethereum L2), with test development on Arbitrum Sepolia.
- **Token standard:** ERC-20 using maintained OpenZeppelin Contracts.
- **Name:** SpicaCash. **Symbol:** SPICA (provisional; verify naming collisions before deployment).
- **Decimals:** 18 as the ERC-20 default, unless a concrete operational need justifies changing it.
- **Supply:** TBD. Prefer fixed total supply with no post-deploy mint role unless a fully documented and reviewed emissions program requires otherwise.
- **Transfers:** vanilla ERC-20; no fee-on-transfer, no rebasing, no blacklist, no hidden administrative balances.
- **Upgradeability:** avoid proxies at first. Immutability reduces trusted control but makes bugs permanent; external review is essential.
- **Treasury:** multisignature-controlled allocation with independently published address, rules and onchain vesting for any team allocation; no private keys in repositories.
- **Distributions:** no onchain rewards system in v0. Design a separate, reviewed allocation process based on accepted contributions with abuse prevention before considering payouts.

A minimal, configurable ERC-20 **prototype**, unit/fuzz tests and an Arbitrum Sepolia-only guarded deployment helper have been added on a draft branch. Stateful invariants, dependency installation, Solidity compilation, actual test execution and any deployment remain unverified/pending. Do not hard-code a final supply or recipient address before approval.

## Structured governance review

The optional offline validator and the intentionally empty tokenomics draft are documented in [Tokenomics governance](TOKENOMICS_GOVERNANCE.md). **No economic quantities or multisig signers are approved**. The validator is not a substitute for financial, security, independent audit or legal review.

## Decisions not made yet

1. Confirm the canonical chain after comparing Arbitrum and Base in practice.
2. Decide fixed supply and units (none selected so far).
3. Define audited allocation percentages: treasury, ecosystem/community, contributors, future liquidity, and team.
4. Determine vesting / lockups / transparency and emergency governance model.
5. Review the MIT software license proposed in the prototype branch; trademark and logo permissions remain separate, and any VirgoStars attribution in applications must be implemented at the UI/product layer.
6. Define eligible uses, token holder rights (if any), transfer restrictions (if any), and compliance perimeter.
7. Decide whether any public offering or exchange-admission process is appropriate.
8. Define independent audit and multisig signers, deployment rehearsal and upgrade response procedures.

## Threat model (initial)

- **Issuance and key theft:** avoid unlimited owner minting, require robust signing/custody and supply checks.
- **Smart contract vulnerabilities:** limit complexity; pin dependency versions; unit, fuzz and invariant testing; external audit.
- **Fake SPICA token impersonators:** clearly document canonical chain and verified contract address only *after* launch.
- **Bridges/cross-chain doubles:** no canonical bridges or multiple versions until thoroughly designed.
- **Reward farming/Sybil behavior:** never reward merely keeping a bot running; use verifiable accepted work, limits and human appeals.
- **Insider and market manipulation:** clear allocation and vesting; no claims of a market or projected returns.
- **Regulatory exposure:** analyze MiCA and local tax/consumer requirements before public issuance, marketing or trading; exemptions are fact-specific.
- **Separation from web service:** a SpicaCash outage must not interrupt VirgoStars AI credit sales or use.

## Release gates

1. Document decisions and publish a plain-language risk description.
2. Prototype on local chain, complete positive/negative/fuzz/invariant tests.
3. Public testnet pilot without value; publish verified source/address.
4. Independent security and legal review; community feedback.
5. Separate and explicit authorization before any mainnet deployment, real treasury transfer, distribution, DEX liquidity or trading facility integration.

## References

- [OpenZeppelin ERC-20](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20)
- [OpenZeppelin access control and multisig guidance](https://docs.openzeppelin.com/contracts/5.x/access-control)
- [ESMA MiCA Article 4](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mica/article-4-offers-public-crypto-assets-other)
