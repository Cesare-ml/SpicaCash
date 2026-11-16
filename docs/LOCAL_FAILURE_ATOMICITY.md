# Local failure atomicity regressions

**Research-only Foundry tests; no public deployment, signer, RPC, wallet or issuance.**

`test/SpicaCashLocalFailureAtomicity.t.sol` adds eight deterministic checks and one bounded fuzz regression alongside the six-stage [local demo](LOCAL_DEMO.md):

1. A delegated transfer with sufficient allowance but insufficient balance must revert with `ERC20InsufficientBalance`, leaving **both balances and the full allowance unchanged**. A subsequent valid transfer must still work and decrement the allowance by exactly the successful amount.
2. A delegated transfer exceeding the granted allowance must revert with `ERC20InsufficientAllowance`, preserving balances, allowance and supply; a subsequent pull within the allowance succeeds.
3. A delegated transfer to the zero address must revert with `ERC20InvalidReceiver`, without spending allowance or moving tokens. A subsequent valid delegated transfer must still work.
4. An unlimited (`uint256.max`) allowance must remain unchanged after both a failed over-balance delegated pull and a subsequent successful pull, matching OpenZeppelin ERC-20 semantics.
5. An approval to the zero spender must revert with `ERC20InvalidSpender`, preserving existing allowances, balances and supply; a subsequent valid revocation must succeed.
6. A rejected pull by spender A must leave both A's and independent spender B's allowances untouched; spender B must still be able to pull within its own limit without affecting A's allowance.
7. A direct transfer to the zero address must revert with `ERC20InvalidReceiver`, preserving supply and balances; a later valid direct transfer must succeed.
8. A direct transfer from an empty synthetic account must revert with the same typed error, preserve the fixed supply and balances, and not prevent a later valid transfer.

The fuzz regression varies a positive delegated amount from 1 to the synthetic supply, grants exactly one base unit less than requested, asserts the full insufficient-allowance payload and unchanged state, then verifies a valid pull for the granted amount. The amount is bounded by modulo to avoid external assumptions or overflow.

These scenarios use fresh synthetic contract actors, a toy 1,000-token supply and 18-decimal base units. The tests compare the complete ABI-encoded ERC-6093 revert payloads, including the account and amount arguments, rather than checking only four-byte selectors. They exercise failure atomicity of the inherited OpenZeppelin ERC-20 implementation rather than introducing token behavior.

## Reproduce in a trusted WSL2/Linux checkout

After the repository's documented dependency-policy preflight and bootstrap, with Foundry, Solidity 0.8.24 and pinned OpenZeppelin 5.4.0 installed locally:

```bash
forge test --offline --match-contract SpicaCashLocalFailureAtomicityTest -vvv
bash scripts/verify-local.sh
```

**Status:** source added for review; no real Forge execution is claimed here. These tests alone do not complete SC-02 or SC-03 and are not a contract audit or authorization to deploy.
