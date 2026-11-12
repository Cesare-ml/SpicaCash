# SpicaCash

**SpicaCash** is a proposed open-source cryptocurrency for the **VirgoStars** ecosystem.

> **Pre-launch / research stage.** No official token contract has been deployed, no mainnet token address exists, and no exchange listing or liquidity is claimed. Beware of impersonators.

## Principles

- SpicaCash is separate from VirgoStars AI usage credits and from payments on virgostars.it.
- The first version **will not** be accepted for purchasing AI credits or site services.
- Open-source code, independently reviewable tokenomics and transparent treasury governance.
- Security reviews, automated tests and a public testnet trial before considering mainnet.
- No guaranteed returns, fixed price, speculative promises or automatic rewards for merely running AI.
- Developer and volunteer rewards, if introduced, will be based on verified contributions, clear criteria and applicable legal review.

## Network

**Recommended for evaluation: Arbitrum One** (Ethereum L2, ERC-20), with Base as the main alternative. This is an architectural preference, **not** a deployment decision. See [Network evaluation](docs/NETWORK_EVALUATION.md).

Why not pick Polygon by default? Polygon PoS has a separate validator/security model and is not an Ethereum rollup. It remains a viable low-fee EVM network, but the first choice should prioritize rollup security and the project's open-source/community ethos.

## Roadmap

1. Agree on the security model, token economics and legal requirements; check name/ticker collisions.
2. Implement minimal ERC-20 prototype and unit/invariant tests in a non-production branch.
3. Publish governance, vesting and distribution rules; obtain external security review.
4. Run a public testnet pilot with no real economic value.
5. Decide whether and when a compliant mainnet launch makes sense.

## Documentation

- [Network evaluation](docs/NETWORK_EVALUATION.md) — research, trade-offs and references.
- [Token design](docs/TOKEN_DESIGN.md) — pending decisions and security checklist.

- [Developer/AI agent guide](AGENTS.md) — safe contributor workflow.

## Security

Never commit mnemonic phrases, private keys, seed phrases or provider secrets. No GitHub Actions are used for automatic deployment; deployments require explicit human approval.

## License

License selection is pending. No license is granted merely by publishing a repository; contributions are not invited until a clear project license and contribution policy are added.
