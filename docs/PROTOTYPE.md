# SpicaCash ERC-20 prototype

**Status: experimental, not audited, not deployed.** This source code must not be represented as a live VirgoStars cryptocurrency.

## Contract

`src/SpicaCash.sol` inherits the plain OpenZeppelin ERC-20 implementation, using a pinned `@openzeppelin/contracts@5.4.0` dependency. The constructor takes:

1. `initialHolder` — nonzero wallet/treasury address receiving all tokens.
2. `initialSupplyBaseUnits` — strictly positive integer, denominated in **smallest units**, where `1 SPICA = 10^18 base units`.

These constructor arguments are intentionally **not predetermined**; the final economic supply and treasury structure require approval. Test fixtures use an arbitrary *example* supply of one million SPICA, **not** a tokenomics decision.

The contract deliberately has **no owner, no upgradeable proxy, no admin minting function, no pause/blacklist, no transaction fees, no rebasing and no built-in rewards mechanism**. All units are minted once, to the constructor recipient. Its deployment-time fixed supply is not an endorsed public token issuance.

## Local setup

Install Node.js (20+) and [Foundry](https://getfoundry.sh/introduction/installation), including `forge` and `cast`. For Windows, WSL2 with Linux tooling is recommended.

```bash
npm install
forge build
forge test -vv
forge test --match-test testFuzz -vv
forge test --match-test invariant_ -vv
forge test --match-contract SpicaCashInvariantTest -vv
node scripts/check-abi.mjs
npm run test:offline
```

The project contains plain Solidity tests with no forge-std dependency. Unit tests check constructor errors, token metadata, transfer amount conservation, approvals (including max allowance), ERC-6093 revert selectors and zero-address transfers. Three fuzz tests cover supply conservation, delegated transfers and overspending.

Stateful handler-based invariants are configured for 64 sequences of 64 calls per invariant and to reject unexpected reverts. They check constant supply and conservation of tracked holder balances across transfers and delegated transfers. The test contract exposes a `targetContracts()` getter to Foundry that **selects only the handler** (the same mechanism used by `forge-std/StdInvariant`), rather than calling a nonexistent `vm.targetContract` cheatcode. Two deterministic smoke tests check the handler target selection and its transfer/approve/pull behavior. These settings **must still be demonstrated by a real Foundry test run**, not inferred from the source. This is useful automated testing, **not formal verification or an audit**.

After compilation, `scripts/check-abi.mjs` rejects any new external function beyond the nine expected ERC-20 methods, unexpected payable functions, missing standard functions or changed constructor types. This only checks the ABI surface, **not implementation behavior, storage safety or network security**. Run its six independent offline tests with `npm run test:abi-guard`.

`npm run test:deploy-guard` runs **15 offline cases** against the Sepolia deployment script with mock `forge` and `cast` executables. They exercise the wrong chain ID, zero receiver address, zero and noncanonical supplies, values above the EVM `uint256` limit, missing or invalid Foundry account names, missing explicit authorization, the exact maximum `uint256` (read-only), and one mock-only authorized call. None of these tests uses a real RPC, signer or transaction.

**Validation status (2026-11-13):** Offline deployment guard **15/15 passed** and independent ABI checker tests **6/6 passed** in a local Linux/Node 22 environment. `forge build`, Solidity unit/fuzz/invariant runs and compiled ABI inspection are **not run** here because the compiler/Foundry and npm dependency retrieval are unavailable. Do not report the smart contract as verified until the Solidity commands pass in a configured environment.

**Never** run tests on a production fork with real signing credentials.


## Invariant test target selection — verification gate

Foundry's documented `StdInvariant` helper declares an internal `targetContract(address)` that records targets and a public `targetContracts()` getter read by the test runner. The project does not include `forge-std`, so `test/SpicaCashInvariant.t.sol` implements only the equivalent public getter and address list needed for handler selection.

The earlier `vm.targetContract(address)` call incorrectly treated the helper as a VM cheatcode and has been removed. The two `testInvariant...` smoke cases verify the getter points exclusively to the handler and that it can transfer, approve and spend an allowance while preserving tracked balances.

Run and record:

```bash
npm install
forge build
forge test --match-contract SpicaCashInvariantTest -vv
forge test --match-test invariant_ -vv
forge test -vv
node scripts/check-abi.mjs
```

Foundry invariant configuration enables `show_metrics = true` to print selector-call statistics. **Inspect the metrics for all three handler functions (`move`, `approve`, `pull`)**; a campaign without handler calls does not demonstrate stateful coverage. Do not count the invariants as validated if compilation fails, if any invariant target is missing, if the handler functions are never called, or if the invariant campaign reports a revert. Keep the PR in draft until real output is attached. No GitHub Actions or onchain deployment are required.

## Arbitrum Sepolia-only helper

The guarded helper `scripts/deploy-arbitrum-sepolia.sh` checks the RPC's chain ID is **421614** before even offering a testnet broadcast. By default it is preflight-only (no transaction). It now refuses the all-zero EVM recipient, invalid or out-of-range `uint256` supplies (compared exactly as decimal strings, never with 64-bit shell arithmetic), and option-like/path-like Foundry keystore identifiers. These are local input checks, not an audit or a guarantee that an untrusted RPC endpoint reports the true network.

```bash
export ARBITRUM_SEPOLIA_RPC_URL="https://sepolia-rollup.arbitrum.io/rpc"
export SPICA_TESTNET_HOLDER="<testnet-receiving-address>"
export SPICA_TESTNET_SUPPLY_BASE_UNITS="1000000000000000000"
bash scripts/deploy-arbitrum-sepolia.sh
```

The sample above represents **one test SPICA** in base units. This will only check the network and arguments; **it does not deploy anything**. After independent test review and an explicit human decision for a testnet-only transaction, a separate explicit confirmation plus `FOUNDRY_ACCOUNT` (local Foundry keystore name) are required. Do not enter seed phrases or private keys into source files, chat, command-line arguments or the repo. **Do not use mainnet credentials.**

## Product boundary

SpicaCash is not an AI-credit payment method and cannot be used to buy VirgoStars credits in the first release. No integration with the VirgoStars backend, website or desktop exists.

## Open decisions / launch gates

- Agree token supply, recipients, allocations, vesting, treasury multisig, and user rights.
- Check ticker/name collisions and complete legal and MiCA analysis.
- Consider security reviews, stronger invariant/fuzzing tests and ecosystem threat scenarios.
- Independently verify testnet bytecode and published addresses.
- Explicitly authorize any public/mainnet deployment in a later decision.

Arbitrum Sepolia reference: https://developer.arbitrum.io/chain-info
