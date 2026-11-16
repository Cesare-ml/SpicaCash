# ERC-20 allowance isolation regression tests (research only)

Status: **source-level tests added; not yet compiled or executed with Foundry**. SpicaCash remains pre-launch and undeployed.

## What is covered

The separate `test/SpicaCashAllowance.t.sol` suite uses independent `SpicaAllowanceSpender` contracts as distinct ERC-20 `msg.sender` accounts. It exercises:

1. **Spender scope:** approval of address A never authorizes address B to pull the token holder's balance.
2. **Partial allowance and replay:** a nine-unit allowance is consumed by transfers of four and five units; another one-unit pull must revert with `ERC20InsufficientAllowance`.
3. **Revocation after max approval:** maximum allowance remains unchanged after a normal transfer (standard OpenZeppelin behavior), but setting the allowance to zero must block subsequent delegated transfers.
4. **Fuzzed spender separation:** arbitrary positive transfer sizes within the synthetic supply must be unavailable to an unapproved spender and available to the approved spender.

Every test asserts relevant balances, allowance state and/or fixed-supply consequences. The supply constant is a **synthetic test fixture**, not a tokenomics proposal. No real holder identity, signing key, treasury allocation, issuance or chain activity is introduced.

## Verification on a trusted machine

Use the reviewed dependency bootstrap with Foundry and solc 0.8.24 already installed:

```bash
bash scripts/bootstrap-deps.sh
forge test --offline --match-contract SpicaCashAllowanceIsolationTest -vv
bash scripts/verify-local.sh
```

The targeted command should execute three deterministic cases and one fuzz test (256 fuzz runs from the committed Foundry profile). Record the actual compiler version, test counts and failure details. The final command checks the integrated project, including the original Solidity and invariant suites.

Do **not** claim these tests passed, that the contract was audited, or that the asset may be issued until genuine compilation and Foundry execution have been completed and independently reviewed.
