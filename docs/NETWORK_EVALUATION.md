# Network evaluation — SpicaCash

Status: **recommendation only; no mainnet deployment authorized**  
Reviewed: 2026-11-12

## Context and constraints

SpicaCash is the proposed official VirgoStars crypto-asset. It is **not** the billing unit for VirgoStars AI credits. Initially, virgostars.it and VirgoStars Desktop will not offer purchases, redemptions, conversions or payments in SpicaCash.

Primary objectives: transparent open-source implementation, security, long-term support, accessibility for small community transfers and verifiable contribution rewards if a distribution program is approved. Keep token operations optional and separate from VirgoStars accounts.

## Recommendation: Arbitrum One (Ethereum rollup)

An ERC-20 on Arbitrum One is our preferred **candidate**, to be confirmed after a threat-model and tokenomics review. Arbitrum is an Ethereum-settled optimistic rollup. The BoLD protocol on Arbitrum One supports permissionless state validation/challenges. Compared with Ethereum L1, community transfers are typically cheaper. Standard EVM tooling, wallets and OpenZeppelin ERC-20 libraries are broadly usable.

**Caveats:** Arbitrum One still has a sequencer, governance and security-council assumptions. Canonical withdrawals to Ethereum involve a challenge delay (the current documentation cites roughly 6.4 days). Sending a token on Arbitrum is not the same as holding an Ethereum-mainnet token. There is no guaranteed liquidity or exchange listing.

## Other candidates

| Network | Structure | Relative fee profile | Advantages | Trade-off |
| --- | --- | --- | --- | --- |
| Ethereum mainnet | L1 | High/variable | Most neutral base layer, broad compatibility | Small community transfers often economically impractical |
| **Arbitrum One** | Ethereum L2 optimistic rollup | Low/variable | Ethereum settlement, BoLD, mature EVM/DeFi ecosystem | Sequencer, upgrades, bridge challenge delay |
| **Base** | Ethereum L2 optimistic rollup | Low/variable | Strong retail onramp UX, active ecosystem, gas sponsorship products | Dependence on Coinbase/Base operator, sequencer/governance assumptions |
| **Polygon PoS** | Independent PoS network checkpointed to Ethereum | Low/variable | Mature EVM tooling, low-cost transfers | Different security trust model from an Ethereum rollup |
| **Solana** | Independent L1 | Very low/variable | Fast transfers, economical high-volume activity | SPL token account/rent model, non-EVM tech and wallet integration |

Both Arbitrum One and Base were listed as Stage 1 by ETHBEAT at review time. **Stage is a maturity/decentralization framework, not a guarantee of safety.** Network costs, liquidity, implementation and upgrade risks require updated checks before deployment.

## Why not Polygon PoS by default?

Polygon PoS is a useful, efficient EVM chain, but its validator set secures transactions independently and periodically checkpoints to Ethereum. It does not inherit Ethereum's validation/security model the way a rollup does. For a long-lived community asset, that distinction matters more than small potential differences in per-transfer gas costs. We therefore prefer an established Ethereum rollup.

## Why Arbitrum over Base?

This is a *judgment call*, not a claim that Base is unsafe. Both are strong candidates. Arbitrum's permissionless BoLD challenge architecture and broader DAO-governed ecosystem fit VirgoStars' open-source/community philosophy. Base may be preferable if user onboarding via Coinbase, account abstraction and consumer wallet distribution become overriding goals.

**Decision gate:** Validate actual costs for ERC-20 deployment and 1, 100, 1,000 transfers; verify withdrawal and operational assumptions, multisig compatibility and wallet onboarding on Arbitrum and Base with current testnets. Reopen this decision if the evidence changes.

## Architecture guardrails

- Start with **one canonical chain**. Do not deploy multiple identically named assets or build a bridge in v1.
- No user funds, mainnet keys, network broadcasts or automated deploy in development workflow.
- Avoid upgradeable/proxy contracts, transfer taxes, blacklists and hidden mint privileges by default.
- Keep the supply model undecided until community distribution, treasury controls, vesting and legal review are specified.
- Verify ticker/name collisions: `SPICA` is a **working symbol**, not proof of uniqueness.
- If wallet-based rewards are later added, protect users against Sybil attacks and avoid publishing private identity data.
- No linkage between SpicaCash and VirgoStars AI credits during the first release.
- No speculative claims about token value.

## Sources

- [ETHBEAT — L2 overview](https://ethbeat.org/layer2s/summary) (dynamic maturity/security overview)
- [Arbitrum — BoLD overview](https://docs.arbitrum.io/how-arbitrum-works/bold/gentle-introduction)
- [Arbitrum — chain information](https://docs.arbitrum.io/chain-info)
- [Base — rollup derivation specification](https://docs.base.org/base-chain/specs/protocol/consensus/derivation)
- [Polygon — building on PoS](https://docs.polygon.technology/pos/get-started/building-on-polygon)
- [Solana — token payment and account model](https://solana.com/docs/payments/how-payments-work)
- [OpenZeppelin — ERC-20 documentation](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20)
