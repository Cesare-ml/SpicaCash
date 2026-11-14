# ERC-20 allowance isolation regression tests (research only)

Status: **source-level tests added; not yet compiled or executed with Foundry**. SpicaCash remains pre-launch and undeployed.

## What is covered

The separate `test/SpicaCashAllowance.t.sol` suite uses two or more independent `SpicaAllowanceSpender` contracts as distinct ERC-20 `msg.sender` accounts. It exercises:

1. **Spender scope:** approval of address A never authorizes address B to pull the token holder's balance, even if B requests only one base unit.
2. **Partial allowance and replay:** a nine-unit allowance is consumed by transfers of four and five units, after which another one-unit pull must revert with `ERC20InsufficientAllowance`.
3. **Revocation after max approval:** `type(uint256).max` approval survives a normal transfer (standard OpenZeppelin behavior), but a subsequent approval of zero must prevent any further delegated transfer.
4. **Fuzzed spender separation:** arbitrary positive transfer sizes within the synthetic supply must be unavailable to an unapproved spender and available to the approved spender.

Every test also asserts relevant balance and/or fixed-supply consequences. No real holder identity, signing key, treasury allocation, issuance or chain activity is introduced. Supply constants are **synthetic test fixtures**, not tokenomics proposals.

## How to verify on a trusted machine

Install the reviewed `@openzeppelin/contracts@5.4.0` dependencies through the documented bootstrap, with Foundry and solc 0.8.24 already present:

```bash
bash scripts/bootstrap-deps.sh
forge test --offline --match-contract SpicaCashAllowanceIsolationTest -vv
bash scripts/verify-local.sh
```

The second command should execute the three deterministic cases and one Foundry fuzz test (256 fuzz runs from `foundry.toml`), not merely inspect function names. Record the actual compiler version, test counts and failure details. The final command also checks the full project, including original Solidity invariants; it can fail closed if Foundry or dependencies are missing.

Do **not** claim these tests passed, a contract was audited, or the asset may be issued until the genuine compiler and Foundry test suite have been run and independently reviewed.
