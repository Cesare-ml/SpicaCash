// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SpicaCash} from "../src/SpicaCash.sol";

// Simple external caller used to exercise allowance and insufficient-balance paths.
// The tests intentionally do not depend on forge-std.
contract TokenActor {
    function pull(SpicaCash token, address owner, address receiver, uint256 amount)
        external
        returns (bool)
    {
        return token.transferFrom(owner, receiver, amount);
    }

    function send(SpicaCash token, address receiver, uint256 amount)
        external
        returns (bool)
    {
        return token.transfer(receiver, amount);
    }
}

contract SpicaCashTest {
    uint256 internal constant TEST_SUPPLY = 1_000_000 * 1e18;
    address internal constant RECEIVER = address(0xB0B);
    address internal constant OTHER = address(0xCAFE);

    function _token() internal returns (SpicaCash) {
        return new SpicaCash(address(this), TEST_SUPPLY);
    }

    function _revertSelector(bytes memory reason) internal pure returns (bytes4 selector) {
        require(reason.length >= 4, "missing revert selector");
        assembly {
            selector := mload(add(reason, 32))
        }
    }

    function testMetadataAndSupplyAreCorrect() public {
        SpicaCash token = _token();
        require(keccak256(bytes(token.name())) == keccak256(bytes("SpicaCash")), "wrong name");
        require(keccak256(bytes(token.symbol())) == keccak256(bytes("SPICA")), "wrong ticker");
        require(token.decimals() == 18, "wrong decimals");
        require(token.totalSupply() == TEST_SUPPLY, "wrong supply");
        require(token.balanceOf(address(this)) == TEST_SUPPLY, "wrong initial holder");
    }

    function testRejectsZeroHolder() public {
        try new SpicaCash(address(0), 1) returns (SpicaCash) {
            revert("zero holder accepted");
        } catch (bytes memory reason) {
            require(
                _revertSelector(reason) == SpicaCash.InvalidInitialHolder.selector,
                "unexpected error"
            );
        }
    }

    function testRejectsZeroInitialSupply() public {
        try new SpicaCash(address(this), 0) returns (SpicaCash) {
            revert("zero supply accepted");
        } catch (bytes memory reason) {
            require(
                _revertSelector(reason) == SpicaCash.InitialSupplyMustBePositive.selector,
                "unexpected error"
            );
        }
    }

    function testDirectTransferDoesNotChargeFees() public {
        SpicaCash token = _token();
        uint256 amount = 42 * 1e18;
        require(token.transfer(RECEIVER, amount), "transfer failed");
        require(token.balanceOf(RECEIVER) == amount, "receiver not paid in full");
        require(token.balanceOf(address(this)) == TEST_SUPPLY - amount, "sender mismatch");
        require(token.totalSupply() == TEST_SUPPLY, "supply changed");
    }

    function testApprovedSpenderCanTransferAndConsumesAllowance() public {
        SpicaCash token = _token();
        TokenActor actor = new TokenActor();
        uint256 amount = 123 * 1e18;
        require(token.approve(address(actor), amount), "approve failed");
        require(actor.pull(token, address(this), RECEIVER, amount), "transferFrom failed");
        require(token.allowance(address(this), address(actor)) == 0, "allowance not consumed");
        require(token.balanceOf(RECEIVER) == amount, "wrong receiver balance");
        require(token.totalSupply() == TEST_SUPPLY, "supply changed");
    }

    function testCannotSpendAnotherWalletWithoutApproval() public {
        SpicaCash token = _token();
        TokenActor actor = new TokenActor();
        try actor.pull(token, address(this), RECEIVER, 1) returns (bool) {
            revert("unauthorized transferFrom succeeded");
        } catch {}
    }

    function testCannotTransferMoreThanBalance() public {
        SpicaCash token = _token();
        TokenActor actor = new TokenActor();
        try actor.send(token, RECEIVER, 1) returns (bool) {
            revert("insufficient balance transfer succeeded");
        } catch {}
    }

    function testFuzz_TransferConservesSupplyAndBalances(uint96 input) public {
        SpicaCash token = _token();
        uint256 amount = uint256(input) % (TEST_SUPPLY + 1);
        require(token.transfer(RECEIVER, amount), "transfer failed");
        require(token.totalSupply() == TEST_SUPPLY, "supply changed");
        require(token.balanceOf(RECEIVER) == amount, "receiver mismatch");
        require(token.balanceOf(address(this)) + token.balanceOf(RECEIVER) == TEST_SUPPLY, "sum mismatch");
    }

    function testFuzz_AllowanceAndSupplyRemainConsistent(uint96 input) public {
        SpicaCash token = _token();
        TokenActor actor = new TokenActor();
        uint256 amount = uint256(input) % (TEST_SUPPLY + 1);
        require(token.approve(address(actor), amount), "approve failed");
        require(actor.pull(token, address(this), OTHER, amount), "transferFrom failed");
        require(token.allowance(address(this), address(actor)) == 0, "remaining allowance");
        require(token.balanceOf(OTHER) == amount, "receiver mismatch");
        require(token.balanceOf(address(this)) + token.balanceOf(OTHER) == TEST_SUPPLY, "sum mismatch");
        require(token.totalSupply() == TEST_SUPPLY, "supply changed");
    }

    function testFuzz_CannotExceedApprovedAllowance(uint96 input) public {
        SpicaCash token = _token();
        TokenActor actor = new TokenActor();
        uint256 amount = (uint256(input) % TEST_SUPPLY) + 1;
        require(token.approve(address(actor), amount - 1), "approve failed");
        try actor.pull(token, address(this), RECEIVER, amount) returns (bool) {
            revert("overspend of allowance succeeded");
        } catch {}
        require(token.balanceOf(RECEIVER) == 0, "unexpected transfer");
    }
}
