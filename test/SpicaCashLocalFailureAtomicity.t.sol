// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SpicaCash} from "../src/SpicaCash.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

// Disposable, synthetic accounts: no RPC, wallet keys, broadcast or real tokens.
contract AtomicityActor {
    function approveSpender(SpicaCash token, address spender, uint256 amount) external {
        require(token.approve(spender, amount), "approve failed");
    }

    function delegatedPull(SpicaCash token, address owner, address recipient, uint256 amount) external {
        require(token.transferFrom(owner, recipient, amount), "pull failed");
    }

    function directSend(SpicaCash token, address recipient, uint256 amount) external {
        require(token.transfer(recipient, amount), "send failed");
    }
}

contract SpicaCashLocalFailureAtomicityTest {
    uint256 private constant UNIT = 1e18;
    uint256 private constant SUPPLY = 1000 * UNIT;

    function _assertError(bytes memory actual, bytes memory expected) private pure {
        require(keccak256(actual) == keccak256(expected), "wrong ERC-6093 revert payload");
    }

    function testDelegatedPullOverBalanceRevertsWithoutConsumingAllowance() public {
        AtomicityActor alice = new AtomicityActor();
        AtomicityActor bob = new AtomicityActor();
        AtomicityActor spender = new AtomicityActor();
        SpicaCash token = new SpicaCash(address(alice), SUPPLY);

        alice.directSend(token, address(bob), 5 * UNIT);
        bob.approveSpender(token, address(spender), 10 * UNIT);

        // Allowance is sufficient, but Bob's balance is not.
        try spender.delegatedPull(token, address(bob), address(alice), 6 * UNIT) {
            revert("over-balance delegated pull succeeded");
        } catch (bytes memory reason) {
            _assertError(reason, abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(bob), 5 * UNIT, 6 * UNIT));
        }

        require(token.balanceOf(address(alice)) == 995 * UNIT, "alice changed");
        require(token.balanceOf(address(bob)) == 5 * UNIT, "bob changed");
        require(token.allowance(address(bob), address(spender)) == 10 * UNIT, "allowance consumed");
        require(token.totalSupply() == SUPPLY, "supply changed");

        // A later valid pull must still work with the original allowance.
        spender.delegatedPull(token, address(bob), address(alice), 3 * UNIT);
        require(token.balanceOf(address(alice)) == 998 * UNIT, "alice final");
        require(token.balanceOf(address(bob)) == 2 * UNIT, "bob final");
        require(token.allowance(address(bob), address(spender)) == 7 * UNIT, "allowance final");
        require(token.totalSupply() == SUPPLY, "final supply");
    }

    function testInsufficientAllowanceRevertsWithoutMovingFunds() public {
        AtomicityActor alice = new AtomicityActor();
        AtomicityActor bob = new AtomicityActor();
        AtomicityActor spender = new AtomicityActor();
        SpicaCash token = new SpicaCash(address(alice), SUPPLY);

        alice.directSend(token, address(bob), 50 * UNIT);
        bob.approveSpender(token, address(spender), 2 * UNIT);

        // Bob has ample funds, but spender is authorized for only two tokens.
        try spender.delegatedPull(token, address(bob), address(alice), 3 * UNIT) {
            revert("over-allowance delegated pull succeeded");
        } catch (bytes memory reason) {
            _assertError(reason, abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(spender), 2 * UNIT, 3 * UNIT));
        }

        require(token.balanceOf(address(alice)) == 950 * UNIT, "alice changed");
        require(token.balanceOf(address(bob)) == 50 * UNIT, "bob changed");
        require(token.allowance(address(bob), address(spender)) == 2 * UNIT, "allowance changed");
        require(token.totalSupply() == SUPPLY, "supply changed");

        spender.delegatedPull(token, address(bob), address(alice), 2 * UNIT);
        require(token.balanceOf(address(alice)) == 952 * UNIT, "alice final");
        require(token.balanceOf(address(bob)) == 48 * UNIT, "bob final");
        require(token.allowance(address(bob), address(spender)) == 0, "allowance final");
        require(token.totalSupply() == SUPPLY, "final supply");
    }

    function testZeroAddressRecipientRevertsWithoutSpendingAllowance() public {
        AtomicityActor alice = new AtomicityActor();
        AtomicityActor spender = new AtomicityActor();
        SpicaCash token = new SpicaCash(address(alice), SUPPLY);

        alice.approveSpender(token, address(spender), 12 * UNIT);
        try spender.delegatedPull(token, address(alice), address(0), 4 * UNIT) {
            revert("zero-recipient delegated pull succeeded");
        } catch (bytes memory reason) {
            _assertError(reason, abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        }

        require(token.balanceOf(address(alice)) == SUPPLY, "alice changed after zero-recipient pull");
        require(token.balanceOf(address(0)) == 0, "zero recipient credited");
        require(token.allowance(address(alice), address(spender)) == 12 * UNIT, "allowance consumed");
        require(token.totalSupply() == SUPPLY, "supply changed");

        spender.delegatedPull(token, address(alice), address(spender), 4 * UNIT);
        require(token.balanceOf(address(alice)) == 996 * UNIT, "alice final");
        require(token.balanceOf(address(spender)) == 4 * UNIT, "spender final");
        require(token.allowance(address(alice), address(spender)) == 8 * UNIT, "allowance final");
        require(token.totalSupply() == SUPPLY, "final supply");
    }

    function testInfiniteAllowanceSurvivesFailedAndSuccessfulPulls() public {
        AtomicityActor alice = new AtomicityActor();
        AtomicityActor bob = new AtomicityActor();
        AtomicityActor spender = new AtomicityActor();
        SpicaCash token = new SpicaCash(address(alice), SUPPLY);

        alice.directSend(token, address(bob), 8 * UNIT);
        bob.approveSpender(token, address(spender), type(uint256).max);

        // A failing pull must not alter an unlimited allowance or any balance.
        try spender.delegatedPull(token, address(bob), address(alice), 9 * UNIT) {
            revert("over-balance unlimited pull succeeded");
        } catch (bytes memory reason) {
            _assertError(reason, abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(bob), 8 * UNIT, 9 * UNIT));
        }

        require(token.balanceOf(address(alice)) == 992 * UNIT, "alice changed");
        require(token.balanceOf(address(bob)) == 8 * UNIT, "bob changed");
        require(token.allowance(address(bob), address(spender)) == type(uint256).max, "infinite allowance changed");
        require(token.totalSupply() == SUPPLY, "supply changed");

        // OpenZeppelin's infinite approval is intentionally not decremented.
        spender.delegatedPull(token, address(bob), address(alice), 3 * UNIT);
        require(token.balanceOf(address(alice)) == 995 * UNIT, "alice final");
        require(token.balanceOf(address(bob)) == 5 * UNIT, "bob final");
        require(token.allowance(address(bob), address(spender)) == type(uint256).max, "infinite allowance spent");
        require(token.totalSupply() == SUPPLY, "final supply");
    }

    function testZeroSpenderApprovalRevertsWithoutChangingState() public {
        AtomicityActor alice = new AtomicityActor();
        AtomicityActor bob = new AtomicityActor();
        SpicaCash token = new SpicaCash(address(alice), SUPPLY);

        alice.approveSpender(token, address(bob), 15 * UNIT);

        try alice.approveSpender(token, address(0), 5 * UNIT) {
            revert("zero-spender approval succeeded");
        } catch (bytes memory reason) {
            _assertError(reason, abi.encodeWithSelector(IERC20Errors.ERC20InvalidSpender.selector, address(0)));
        }

        require(token.allowance(address(alice), address(bob)) == 15 * UNIT, "existing approval changed");
        require(token.allowance(address(alice), address(0)) == 0, "zero spender approved");
        require(token.balanceOf(address(alice)) == SUPPLY, "alice balance changed");
        require(token.balanceOf(address(bob)) == 0, "bob balance changed");
        require(token.totalSupply() == SUPPLY, "supply changed");

        // A rejected approval must not interfere with a later valid revocation.
        alice.approveSpender(token, address(bob), 0);
        require(token.allowance(address(alice), address(bob)) == 0, "revocation failed");
        require(token.totalSupply() == SUPPLY, "final supply");
    }

    function testFailedPullDoesNotAffectAnotherSpenderAllowance() public {
        AtomicityActor alice = new AtomicityActor();
        AtomicityActor bob = new AtomicityActor();
        AtomicityActor spenderA = new AtomicityActor();
        AtomicityActor spenderB = new AtomicityActor();
        SpicaCash token = new SpicaCash(address(alice), SUPPLY);

        alice.directSend(token, address(bob), 20 * UNIT);
        bob.approveSpender(token, address(spenderA), 2 * UNIT);
        bob.approveSpender(token, address(spenderB), 7 * UNIT);

        try spenderA.delegatedPull(token, address(bob), address(alice), 3 * UNIT) {
            revert("unauthorized spender A pull succeeded");
        } catch (bytes memory reason) {
            _assertError(
                reason,
                abi.encodeWithSelector(
                    IERC20Errors.ERC20InsufficientAllowance.selector,
                    address(spenderA),
                    2 * UNIT,
                    3 * UNIT
                )
            );
        }

        require(token.allowance(address(bob), address(spenderA)) == 2 * UNIT, "spender A allowance changed");
        require(token.allowance(address(bob), address(spenderB)) == 7 * UNIT, "spender B allowance changed");
        require(token.balanceOf(address(alice)) == 980 * UNIT, "alice changed");
        require(token.balanceOf(address(bob)) == 20 * UNIT, "bob changed");
        require(token.totalSupply() == SUPPLY, "supply changed");

        spenderB.delegatedPull(token, address(bob), address(alice), 4 * UNIT);
        require(token.allowance(address(bob), address(spenderA)) == 2 * UNIT, "spender A allowance spent");
        require(token.allowance(address(bob), address(spenderB)) == 3 * UNIT, "spender B allowance incorrect");
        require(token.balanceOf(address(alice)) == 984 * UNIT, "alice final");
        require(token.balanceOf(address(bob)) == 16 * UNIT, "bob final");
        require(token.totalSupply() == SUPPLY, "final supply");
    }

    function testDirectTransferToZeroAddressPreservesSupplyAndBalance() public {
        AtomicityActor alice = new AtomicityActor();
        AtomicityActor bob = new AtomicityActor();
        SpicaCash token = new SpicaCash(address(alice), SUPPLY);

        try alice.directSend(token, address(0), 4 * UNIT) {
            revert("zero-recipient direct transfer succeeded");
        } catch (bytes memory reason) {
            _assertError(reason, abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        }

        require(token.balanceOf(address(alice)) == SUPPLY, "alice changed");
        require(token.balanceOf(address(0)) == 0, "zero address credited");
        require(token.totalSupply() == SUPPLY, "supply changed");

        alice.directSend(token, address(bob), 4 * UNIT);
        require(token.balanceOf(address(alice)) == 996 * UNIT, "alice final");
        require(token.balanceOf(address(bob)) == 4 * UNIT, "bob final");
        require(token.totalSupply() == SUPPLY, "final supply");
    }

    function testFailedDirectTransferPreservesBalancesAndSubsequentTransfer() public {
        AtomicityActor alice = new AtomicityActor();
        AtomicityActor bob = new AtomicityActor();
        SpicaCash token = new SpicaCash(address(alice), SUPPLY);

        try bob.directSend(token, address(alice), 1 * UNIT) {
            revert("empty-wallet transfer succeeded");
        } catch (bytes memory reason) {
            _assertError(reason, abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(bob), 0, 1 * UNIT));
        }

        require(token.balanceOf(address(alice)) == SUPPLY, "alice changed after failure");
        require(token.balanceOf(address(bob)) == 0, "bob changed after failure");
        require(token.totalSupply() == SUPPLY, "supply changed after failure");

        alice.directSend(token, address(bob), 1 * UNIT);
        require(token.balanceOf(address(alice)) == 999 * UNIT, "alice final");
        require(token.balanceOf(address(bob)) == 1 * UNIT, "bob final");
        require(token.totalSupply() == SUPPLY, "final supply");
    }
}
