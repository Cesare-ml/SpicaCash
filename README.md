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

## Experimental ERC-20 prototype

The initial Solidity implementation, unit/fuzz test suite and guarded Arbitrum Sepolia helper are in a draft development branch, **not released or deployed**.

- [Prototype and local instructions](docs/PROTOTYPE.md)
- Contract: `src/SpicaCash.sol` (simple fixed supply, no owner or privileged minting)
- Testing: Foundry + `@openzeppelin/contracts@5.4.0`
- License: MIT for code; VirgoStars marks and identity are not licensed for impersonation (see [NOTICE](NOTICE))

**Dependency integrity:** The committed npm lockfile pins `@openzeppelin/contracts@5.4.0` to a reviewed SHA-512 digest. The repository also sets `ignore-scripts=true` in `.npmrc` and pins the reviewed npm commands in the lock-policy checker. Use this order in a clean checkout, **before running any npm script**:

```bash
bash scripts/bootstrap-deps.sh
bash scripts/verify-local.sh
```

`scripts/bootstrap-deps.sh` checks the package policy before calling npm and enforces `npm ci --ignore-scripts`. The local verification gate also checks the policy **before any npm script**, removes inherited `NODE_OPTIONS` / `npm_config_node_options` values, and explicitly uses `npm --node-options='' --ignore-scripts run test:offline`. `npm ci --ignore-scripts` disables install-time lifecycle scripts even if npm's configuration was altered. The Node policy check catches unexpected npm hooks, script-command drift, overrides, extra package metadata and changes to `.npmrc`. Its **38/38 local tests passed**, including actual offline npm installations in isolated, dependency-free fixtures. Do not mistake this for a verified OpenZeppelin installation or Solidity compilation. Upgrades and approved script changes must update the explicit review policy.

These entrypoints guard against npm lifecycle hooks and inherited Node preload options, but **cannot make an untrusted local shell, PATH, npm/Node binary or `BASH_ENV` safe**. Run them in a trusted, clean environment.

**Local verification gate:** After installing Node.js, Foundry and dependencies, use `bash scripts/verify-local.sh` (Bash/WSL2), not plain `npm run verify:local`: an unreviewed pre-run hook could execute before npm invokes the verifier if local npm configuration has been overridden. This runs offline tests, a fresh Forge build, compiled ABI checks, the Solidity suite, and a strict invariant-campaign evidence check. It **does not deploy** or authorize issuing tokens. All Forge build/test stages use **`--offline`** and require the configured Solidity compiler to be installed locally; they do not fetch compiler versions during verification. **Latest complete offline validation (14 November 2026): 161/161 passed**, exit code 0, on the previously source-verified reconstruction updated with seven SHA-matched files from PR #2. Four new tests demonstrate and prevent inherited Node preload execution. This includes npm lifecycle, dependency-lock, ABI, testnet guard, RPC validation, synthetic Foundry output parsing, and mock verification-stage checks. This was not a full Git clone. Real Solidity compilation, compiler-derived ABI inspection and Foundry unit/fuzz/invariant campaigns **remain unrun** (Forge/solc unavailable); see [prototype validation status](docs/PROTOTYPE.md).

The initial supply is not chosen and no on-chain address has been assigned. Do not treat any `SPICA` token shown elsewhere as official.

## Roadmap

1. Agree on the security model, token economics and legal requirements; check name/ticker collisions.
2. Review minimal ERC-20 prototype and unit/fuzz tests; add stateful invariants and complete offline validation.
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

The prototype code and repository documentation are under the [MIT License](LICENSE). Third-party OpenZeppelin code uses its own MIT license. **VirgoStars branding and official token identity are not part of the software license.** See [NOTICE](NOTICE).
