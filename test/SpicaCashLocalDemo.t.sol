// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SpicaCash} from "../src/SpicaCash.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

// Educational, in-memory Foundry fixture. These contracts are never deployed
// to a public chain and do not represent real wallets or treasury addresses.
contract DemoWallet {
    function send(SpicaCash token, address recipient, uint256 amount) external {
        require(token.transfer(recipient, amount), "demo transfer failed");
    }

    function authorize(SpicaCash token, address spender, uint256 amount) external {
        require(token.approve(spender, amount), "demo approval failed");
    }
}

contract DemoSpender {
    function pull(SpicaCash token, address owner, address recipient, uint256 amount) external {
        require(token.transferFrom(owner, recipient, amount), "demo transferFrom failed");
    }
}

/**
 * @notice A single readable, fully local ERC-20 user journey.
 * @dev Run with:
 *      forge test --offline --match-contract SpicaCashLocalDemoTest -vvvv
 *
 * Uses Foundry's disposable test EVM, synthetic wallet-contract addresses,
 * and toy amounts. No RPC, signer, broadcast, wallet connection, or real SPICA.
 */
contract SpicaCashLocalDemoTest {
    uint256 private constant UNIT = 1e18;
    uint256 private constant DEMO_SUPPLY = 1_000 * UNIT;

    event DemoBalances(
        string checkpoint,
        uint256 aliceBalance,
        uint256 bobBalance,
        uint256 bobSpenderAllowance,
        uint256 totalSupply
    );

    function _snapshot(
        SpicaCash token,
        DemoWallet alice,
        DemoWallet bob,
        DemoSpender spender,
        string memory checkpoint
    ) private {
        emit DemoBalances(
            checkpoint,
            token.balanceOf(address(alice)),
            token.balanceOf(address(bob)),
            token.allowance(address(bob), address(spender)),
            token.totalSupply()
        );
    }

    function testLocalDemoMintTransferApprovePullAndRevoke() public {
        DemoWallet alice = new DemoWallet();
        DemoWallet bob = new DemoWallet();
        DemoSpender spender = new DemoSpender();

        // The fixed supply and synthetic recipient exist only for this test.
        SpicaCash token = new SpicaCash(address(alice), DEMO_SUPPLY);
        require(keccak256(bytes(token.name())) == keccak256(bytes("SpicaCash")), "name");
        require(keccak256(bytes(token.symbol())) == keccak256(bytes("SPICA")), "symbol");
        require(token.decimals() == 18, "decimals");
        require(token.totalSupply() == DEMO_SUPPLY, "initial supply");
        require(token.balanceOf(address(alice)) == DEMO_SUPPLY, "alice initial");
        require(token.balanceOf(address(bob)) == 0, "bob initial");
        _snapshot(token, alice, bob, spender, "initial: alice 1000, bob 0");

        alice.send(token, address(bob), 125 * UNIT);
        require(token.balanceOf(address(alice)) == 875 * UNIT, "alice after send");
        require(token.balanceOf(address(bob)) == 125 * UNIT, "bob after send");
        _snapshot(token, alice, bob, spender, "transfer: alice 875, bob 125");

        bob.authorize(token, address(spender), 20 * UNIT);
        require(token.allowance(address(bob), address(spender)) == 20 * UNIT, "approval");
        spender.pull(token, address(bob), address(alice), 7 * UNIT);
        require(token.balanceOf(address(alice)) == 882 * UNIT, "alice after pull");
        require(token.balanceOf(address(bob)) == 118 * UNIT, "bob after pull");
        require(token.allowance(address(bob), address(spender)) == 13 * UNIT, "remaining allowance");
        _snapshot(token, alice, bob, spender, "delegated pull: alice 882, bob 118");

        bob.authorize(token, address(spender), 0);
        require(token.allowance(address(bob), address(spender)) == 0, "revocation");
        _snapshot(token, alice, bob, spender, "approval revoked");

        // An unauthorized follow-up transfer must fail without moving value.
        try spender.pull(token, address(bob), address(alice), 1 * UNIT) {
            revert("revoked approval unexpectedly spent");
        } catch (bytes memory reason) {
            require(reason.length >= 4, "missing ERC20 error selector");
            bytes4 selector;
            assembly {
                selector := mload(add(reason, 32))
            }
            require(
                selector == IERC20Errors.ERC20InsufficientAllowance.selector,
                "wrong error on revoked allowance"
            );
        }

        require(token.balanceOf(address(alice)) == 882 * UNIT, "alice changed after failure");
        require(token.balanceOf(address(bob)) == 118 * UNIT, "bob changed after failure");
        require(token.allowance(address(bob), address(spender)) == 0, "approval restored");
        require(
            token.balanceOf(address(alice)) + token.balanceOf(address(bob)) == DEMO_SUPPLY,
            "balances do not conserve supply"
        );
        require(token.totalSupply() == DEMO_SUPPLY, "total supply changed");
        _snapshot(token, alice, bob, spender, "final: rejected pull; total still 1000");
    }
}
