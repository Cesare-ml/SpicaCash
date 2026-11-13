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

After compilation, `scripts/check-abi.mjs` rejects any new external function beyond the nine expected ERC-20 methods, changed input/output types or mutability, unexpected payable functions, altered constructor arguments, and absent/modified ERC-20 `Transfer` and `Approval` events (including `indexed` flags). It accepts compiler-emitted error entries without granting them callable permissions. This checks only the **ABI surface**, not implementation behavior, event emission at runtime, storage safety, bytecode equivalence or network security. Run its **21 independent offline tests** with `npm run test:abi-guard`.

`npm run test:deploy-guard` runs **15 offline cases** against the Sepolia deployment script with mock `forge` and `cast` executables. They exercise the wrong chain ID, zero receiver address, zero and noncanonical supplies, values above the EVM `uint256` limit, missing or invalid Foundry account names, missing explicit authorization, the exact maximum `uint256` (read-only), and one mock-only authorized call. None of these tests uses a real RPC, signer or transaction.

**Validation status (2026-11-13):** **Complete PR #2 offline suite passed: 91/91 cases** using `npm run test:offline` in a manually reconstructed local source tree with the same package layout and Git blob SHA-1s as the GitHub PR, after correcting the test/shell RPC harness repository-root path. Results: ABI **21/21**, deploy guards **15/15**, RPC URL **18/18**, mocked RPC integration **8/8**, Foundry evidence parser (synthetic transcripts) **20/20**, local verification pipeline mocks **9/9**, zero failures, exit code 0. The RPC integration test also passed when invoked from an unrelated working directory. No real provider, signer, blockchain call, or broadcast was involved. This is **not a full Git clone/checkout** and **not** a Solidity build. `forge build`, Solidity unit/fuzz/invariant runs and compiled ABI inspection remain **unrun** here because Foundry, solc and npm dependency retrieval are unavailable. Do not report the smart contract as verified until the Solidity commands pass in a configured environment.

## One-command local Solidity verification gate

On a machine with Node.js 20+, Bash (WSL2 on Windows), Foundry, a **preinstalled local Solidity compiler 0.8.24**, and locally installed `@openzeppelin/contracts@5.4.0`, run:

```bash
npm install
npm run verify:local
```

The script `scripts/verify-local.sh` is **offline-only for blockchain interactions**. It checks that `forge` and the OpenZeppelin ERC-20 dependency exist, removes inherited testnet/RPC/keystore variables from its environment, then runs these five gates sequentially:

1. `npm run test:offline` (91 checks, including 20 synthetic parser regressions and nine fully mocked verification-pipeline scenarios).
2. `forge build --offline --force` to compile fresh Solidity artifacts **without downloading a compiler**.
3. `node scripts/check-abi.mjs` against the **actual compiled artifact**.
4. `forge test --offline -vv` for the full unit, fuzz and invariant suite.
5. `forge test --offline --match-contract SpicaCashInvariantTest -vv` and `node scripts/check-foundry-invariants.mjs <output>` to reject missing/failed tests, fewer than 64 runs or 4,096 calls in any of the three invariant campaigns, or any nonzero revert counts. Both deterministic handler smoke tests must also pass.

The invariant transcript verifier now requires one (and only one) matching Foundry suite header, exactly five passing test markers **within that suite**, an exact five-passed/zero-failed/zero-skipped summary, and three campaigns above the configured run/call thresholds. It rejects transcripts with unrelated suites or PASS markers after the suite summary. `test/shell/verify-local-guard.test.sh` uses mocked Node/npm/Forge binaries to assert the gate fails at each intermediate stage and clears inherited RPC/account environment settings. These checks exercise validation plumbing, **not** Solidity bytecode, and must not be described as real Foundry test runs.

All three Forge invocations in `verify:local` explicitly use Foundry's `--offline` option, in addition to clearing inherited RPC variables. If the specified compiler is not already installed, **the gate must fail**, not download it. The nine mocked verification-pipeline tests assert that every Forge invocation includes `--offline`; the full offline suite remains **91/91**. The locally executed verification is still **blocked** on missing Foundry, so no Solidity test pass is claimed. 

**An external review must still inspect the Foundry selector metrics for `move`, `approve` and `pull`** and verify that real Foundry/compiler binaries were used. Output parsing does not establish executable authenticity, account safety, or audit-grade assurance. No build or Solidity tests were completed on the contributor machine used for this update: `forge` is not installed there, and `npm run verify:local` correctly exits with code 2 and a missing-Foundry error. `npm run test:offline` passed **91/91** on the byte-matched local source reconstruction. Build dependencies may need to be installed before using this gate, but no deployment should be triggered.

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

Before making the chain-ID query, the helper uses `scripts/validate-rpc-url.mjs` to check **HTTPS-only** RPC URL syntax. It refuses embedded URL user credentials, fragments, whitespace, backslashes and malformed ports, and never prints the RPC URL in its own diagnostic messages. This is a syntactic/TLS-transport safeguard; it **does not prove the server's identity, honesty, TLS certificate validity or the accuracy of the returned chain ID**. The preflight now supplies the RPC URL via Foundry's `ETH_RPC_URL` environment variable rather than command-line arguments, suppresses raw `cast` failure stderr, and never echoes an unexpected chain-ID payload. This avoids provider tokens appearing in `cast`/`forge` argv and these preflight diagnostics; environment variables are still visible to sufficiently privileged local processes, and a future real `forge create` error or tool logging may expose URL query tokens. Use a dedicated, low-privilege testnet RPC credential and do not paste real provider URLs into issue reports or logs. The separate offline tests are `npm run test:rpc-url` (18 tests) and `npm run test:rpc-deploy-guard` (eight mock integration checks). Both use synthetic URLs and no network.

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
