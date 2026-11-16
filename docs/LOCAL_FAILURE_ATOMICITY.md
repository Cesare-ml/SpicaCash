# Local failure atomicity regressions

**Research-only Foundry tests; no public deployment, signer, RPC, wallet or issuance.**

`test/SpicaCashLocalFailureAtomicity.t.sol` adds three independent checks alongside the six-stage [local demo](LOCAL_DEMO.md):

1. A delegated transfer with sufficient allowance but insufficient balance must revert with `ERC20InsufficientBalance`, leaving **both balances and the full allowance unchanged**. A subsequent valid transfer must still work and decrement the allowance by exactly the successful amount.
2. A delegated transfer to the zero address must revert with `ERC20InvalidReceiver`, without spending allowance or moving tokens. A subsequent valid delegated transfer must still work.
3. A direct transfer from an empty synthetic account must revert with the same typed error, preserve the fixed supply and balances, and not prevent a later valid transfer.

These scenarios use fresh synthetic contract actors, a toy 1,000-token supply and 18-decimal base units. They exercise failure atomicity of the inherited OpenZeppelin ERC-20 implementation rather than introducing token behavior.

## Reproduce in a trusted WSL2/Linux checkout

After the repository's documented dependency-policy preflight and bootstrap, with Foundry, Solidity 0.8.24 and pinned OpenZeppelin 5.4.0 installed locally:

```bash
forge test --offline --match-contract SpicaCashLocalFailureAtomicityTest -vvv
bash scripts/verify-local.sh
```

**Status:** source added for review; no real Forge execution is claimed here. These tests alone do not complete SC-02 or SC-03 and are not a contract audit or authorization to deploy.
