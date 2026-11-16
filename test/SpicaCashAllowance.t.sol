// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SpicaCash} from "../src/SpicaCash.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

/**
 * @dev Minimal independent spender: each instance is a distinct msg.sender
 *      when interacting with SpicaCash. No forge-std or private keys.
 */
contract SpicaAllowanceSpender {
    function spend(SpicaCash token, address owner, address recipient, uint256 amount)
        external
    {
        require(token.transferFrom(owner, recipient, amount), "transferFrom returned false");
    }
}

/**
 * @dev Isolated standard ERC-20 allowance regressions, research/test only.
 *      Never deploys on a network or chooses a real SPICA supply.
 */
contract SpicaCashAllowanceIsolationTest {
    uint256 private constant FIXTURE_SUPPLY = 1_000_000 * 1e18;
    address private constant RECIPIENT = address(0xB0B);

    function _token() private returns (SpicaCash) {
        return new SpicaCash(address(this), FIXTURE_SUPPLY);
    }

    function _expectInsufficientAllowance(
        SpicaAllowanceSpender spender,
        SpicaCash token,
        uint256 amount
    ) private {
        try spender.spend(token, address(this), RECIPIENT, amount) {
            revert("unapproved spender was allowed");
        } catch (bytes memory reason) {
            require(reason.length >= 4, "missing revert data");
            bytes4 selector;
            assembly {
                selector := mload(add(reason, 32))
            }
            require(
                selector == IERC20Errors.ERC20InsufficientAllowance.selector,
                "unexpected allowance error"
            );
        }
    }

    function testAllowanceIsScopedToOneSpender() public {
        SpicaCash token = _token();
        SpicaAllowanceSpender allowed = new SpicaAllowanceSpender();
        SpicaAllowanceSpender blocked = new SpicaAllowanceSpender();

        require(token.approve(address(allowed), 9), "approval failed");
        _expectInsufficientAllowance(blocked, token, 1);
        require(token.allowance(address(this), address(allowed)) == 9, "approval lost");
        require(token.allowance(address(this), address(blocked)) == 0, "cross-spender allowance");

        allowed.spend(token, address(this), RECIPIENT, 9);
        require(token.allowance(address(this), address(allowed)) == 0, "allowance not spent");
        require(token.balanceOf(RECIPIENT) == 9, "recipient amount mismatch");
        require(token.totalSupply() == FIXTURE_SUPPLY, "supply changed");
    }

    function testPartialAllowanceCannotBeReplayed() public {
        SpicaCash token = _token();
        SpicaAllowanceSpender spender = new SpicaAllowanceSpender();

        require(token.approve(address(spender), 9), "approval failed");
        spender.spend(token, address(this), RECIPIENT, 4);
        require(token.allowance(address(this), address(spender)) == 5, "partial allowance");
        spender.spend(token, address(this), RECIPIENT, 5);
        require(token.allowance(address(this), address(spender)) == 0, "remaining allowance");
        _expectInsufficientAllowance(spender, token, 1);

        require(token.balanceOf(RECIPIENT) == 9, "replay moved tokens");
        require(token.balanceOf(address(this)) == FIXTURE_SUPPLY - 9, "owner balance changed");
        require(token.totalSupply() == FIXTURE_SUPPLY, "supply changed");
    }

    function testInfiniteAllowanceCanStillBeRevoked() public {
        SpicaCash token = _token();
        SpicaAllowanceSpender spender = new SpicaAllowanceSpender();

        require(token.approve(address(spender), type(uint256).max), "approval failed");
        spender.spend(token, address(this), RECIPIENT, 3);
        require(
            token.allowance(address(this), address(spender)) == type(uint256).max,
            "infinite allowance consumed"
        );
        require(token.approve(address(spender), 0), "revocation failed");
        _expectInsufficientAllowance(spender, token, 1);
        require(token.allowance(address(this), address(spender)) == 0, "allowance restored");
        require(token.balanceOf(RECIPIENT) == 3, "revoked allowance moved funds");
        require(token.totalSupply() == FIXTURE_SUPPLY, "supply changed");
    }

    function testFuzz_UnapprovedSpenderCannotBorrowAllowance(uint96 seed) public {
        SpicaCash token = _token();
        SpicaAllowanceSpender allowed = new SpicaAllowanceSpender();
        SpicaAllowanceSpender blocked = new SpicaAllowanceSpender();
        uint256 amount = (uint256(seed) % FIXTURE_SUPPLY) + 1;

        require(token.approve(address(allowed), amount), "approval failed");
        _expectInsufficientAllowance(blocked, token, amount);
        require(token.balanceOf(RECIPIENT) == 0, "unauthorized transfer");
        allowed.spend(token, address(this), RECIPIENT, amount);
        require(token.balanceOf(RECIPIENT) == amount, "authorized amount");
        require(token.allowance(address(this), address(allowed)) == 0, "allowance not spent");
        require(token.totalSupply() == FIXTURE_SUPPLY, "supply changed");
    }
}
