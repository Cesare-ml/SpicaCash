# Local SpicaCash wallet walkthrough (simulation only)

**Not a token launch.** This scenario deploys the **real source contract** to Foundry's disposable in-memory test EVM. It does not create an official SPICA token, access an RPC endpoint, sign a transaction, connect a wallet, issue real rewards or move money. All quantities and addresses are synthetic and erased after the test.

Test source: [`test/SpicaCashLocalDemo.t.sol`](../test/SpicaCashLocalDemo.t.sol).

## What you can see

The scenario uses three contract-based actors created afresh for each run:

- Alice: synthetic initial holder of **1,000 sample SPICA** (not a proposed supply).
- Bob: synthetic recipient who later grants and revokes an allowance.
- Spender: synthetic delegated actor authorized to transfer a bounded amount from Bob.

The test verifies token name, symbol and decimals, initial supply, two balance changes, a bounded `approve`/`transferFrom`, revocation, a blocked unauthorized follow-up transfer, and **invariant total supply**. It emits `DemoBalances` events so verbose Forge traces can show checkpoints.

| Checkpoint | Alice | Bob | Bob's allowance for spender | Total |
| --- | ---: | ---: | ---: | ---: |
| Initial local mint | 1,000 | 0 | 0 | 1,000 |
| Alice sends 125 to Bob | 875 | 125 | 0 | 1,000 |
| Bob approves 20; spender pulls 7 back to Alice | 882 | 118 | 13 | 1,000 |
| Bob revokes allowance | 882 | 118 | 0 | 1,000 |
| Unauthorized pull of 1 is rejected | 882 | 118 | 0 | 1,000 |

Amounts in the table are human-readable tokens; the Solidity assertions operate in **18-decimal base units**.

## Windows 11 + WSL2 walkthrough

1. Install Git, Node.js 20+, WSL2 (Ubuntu recommended), Foundry (`forge`) and an installed local Solidity compiler 0.8.24, following their official documentation. Foundry execution on Windows is recommended through WSL2.
2. In the trusted WSL2 terminal, clone the repository and enter it:

   ```bash
   git clone https://github.com/Cesare-ml/SpicaCash.git
   cd SpicaCash
   ```

3. Confirm tool availability and run the reviewed dependency bootstrap:

   ```bash
   node --version
   forge --version
   node scripts/check-dependency-lock.mjs
   bash scripts/bootstrap-deps.sh
   ```

   The bootstrap performs a dependency-policy check before an `npm ci --ignore-scripts` install. **Do not** run arbitrary `npm` scripts or `npm install` before the policy check. Use a clean, trusted checkout and toolchain. If `NODE_OPTIONS`, `npm_config_node_options` or `NPM_CONFIG_NODE_OPTIONS` are set, follow the clearing guidance in [`AGENTS.md`](../AGENTS.md) before invoking Node.

4. Run **only** the local scenario, without any RPC, real wallet or signer:

   ```bash
   unset ETH_RPC_URL ARBITRUM_SEPOLIA_RPC_URL FOUNDRY_FORK_URL FOUNDRY_RPC_URL
   forge test --offline --match-contract SpicaCashLocalDemoTest -vvvv
   ```

   The `--offline` flag prevents Foundry from downloading a compiler or accessing a remote chain. Ensure compiler **0.8.24** was installed beforehand. Verbosity `-vvvv` can show the call and event traces, including `DemoBalances` checkpoints. Anvil is **not** required for this Foundry test.

5. Separately, run the **full** local security suite and record its results:

   ```bash
   bash scripts/verify-local.sh
   ```

   This checks the combined Node/Bash suites, compiles source, inspects compiled ABI and runs all Solidity tests/invariants. It does not deploy a public token or replace an independent audit.

## What counts as completion

The source/demo is **prepared**, but the SC-03 roadmap box remains **unchecked** until a fresh trusted checkout executes the command successfully, captures the tested commit, versions and trace, and a second reviewer inspects the evidence. In particular, previous offline mock tests are not evidence that this Solidity test compiled or passed. Also complete SC-02 full validation before considering wider testing.

If `forge` is missing, Solidity 0.8.24 has not been installed, or `@openzeppelin/contracts@5.4.0` is absent, report the test as **blocked**; do not claim success. The simulation is not a public Arbitrum Sepolia testnet pilot, an audit, a wallet application or an authorization to deploy.

**Safety boundary:** No token issuance, keys, production addresses, funds, GitHub Actions, public RPCs, exchange operations, treasury transfers or conversions with VirgoStars AI credits.
