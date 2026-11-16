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

    function _selector(bytes memory reason) private pure returns (bytes4 value) {
        require(reason.length >= 4, "missing revert selector");
        assembly {
            value := mload(add(reason, 32))
        }
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
            require(_selector(reason) == IERC20Errors.ERC20InsufficientBalance.selector, "wrong balance error");
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

    function testFailedDirectTransferPreservesBalancesAndSubsequentTransfer() public {
        AtomicityActor alice = new AtomicityActor();
        AtomicityActor bob = new AtomicityActor();
        SpicaCash token = new SpicaCash(address(alice), SUPPLY);

        try bob.directSend(token, address(alice), 1 * UNIT) {
            revert("empty-wallet transfer succeeded");
        } catch (bytes memory reason) {
            require(_selector(reason) == IERC20Errors.ERC20InsufficientBalance.selector, "wrong direct-transfer error");
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
