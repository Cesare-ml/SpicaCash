// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SpicaCash} from "../src/SpicaCash.sol";

/**
 * @dev Minimal Foundry cheatcode interface. Avoids a forge-std dependency.
 * Foundry targets only the handler during invariant campaigns.
 */
interface VmInvariant {
    function targetContract(address newTargetedContract) external;
}

contract InvariantWallet {
    function send(SpicaCash token, address recipient, uint256 amount) external {
        require(token.transfer(recipient, amount), "transfer returned false");
    }

    function approveSpender(SpicaCash token, address spender, uint256 amount) external {
        require(token.approve(spender, amount), "approve returned false");
    }
}

/**
 * @notice Bounded handler for stateful Foundry invariants.
 * @dev Operations are designed not to revert: fail_on_revert=true detects
 *      unexpected failures instead of silently accepting ineffective fuzz runs.
 */
contract SpicaCashInvariantHandler {
    SpicaCash private immutable token;
    InvariantWallet private immutable wallet0;
    InvariantWallet private immutable wallet1;
    InvariantWallet private immutable wallet2;

    constructor(
        SpicaCash token_,
        InvariantWallet wallet0_,
        InvariantWallet wallet1_,
        InvariantWallet wallet2_
    ) {
        token = token_;
        wallet0 = wallet0_;
        wallet1 = wallet1_;
        wallet2 = wallet2_;
    }

    function _wallet(uint256 seed) private view returns (InvariantWallet) {
        uint256 index = seed % 3;
        if (index == 0) return wallet0;
        if (index == 1) return wallet1;
        return wallet2;
    }

    function _destination(uint256 sourceSeed, uint256 otherSeed)
        private
        pure
        returns (uint256)
    {
        // Always choose a distinct wallet to exercise actual balance movement.
        return ((sourceSeed % 3) + 1 + (otherSeed % 2)) % 3;
    }

    function move(uint256 sourceSeed, uint256 otherSeed, uint256 amountSeed) external {
        InvariantWallet from = _wallet(sourceSeed);
        InvariantWallet to = _wallet(_destination(sourceSeed, otherSeed));
        uint256 balance = token.balanceOf(address(from));
        // Supply in this fixture is far below uint256.max, so balance + 1 is safe.
        uint256 amount = amountSeed % (balance + 1);
        from.send(token, address(to), amount);
    }

    function approve(uint256 ownerSeed, uint256 amountSeed) external {
        InvariantWallet owner = _wallet(ownerSeed);
        uint256 balance = token.balanceOf(address(owner));
        // Include both zero and full-balance allowances.
        owner.approveSpender(token, address(this), amountSeed % (balance + 1));
    }

    function pull(uint256 ownerSeed, uint256 otherSeed, uint256 amountSeed) external {
        InvariantWallet owner = _wallet(ownerSeed);
        InvariantWallet to = _wallet(_destination(ownerSeed, otherSeed));
        uint256 allowance = token.allowance(address(owner), address(this));
        uint256 balance = token.balanceOf(address(owner));
        uint256 available = allowance < balance ? allowance : balance;
        uint256 amount = amountSeed % (available + 1);
        require(
            token.transferFrom(address(owner), address(to), amount),
            "transferFrom returned false"
        );
    }
}

contract SpicaCashInvariantTest {
    uint256 private constant INITIAL_SUPPLY = 1_000_000 * 1e18;

    VmInvariant private constant vm =
        VmInvariant(address(uint160(uint256(keccak256("hevm cheat code")))));

    SpicaCash private token;
    InvariantWallet private wallet0;
    InvariantWallet private wallet1;
    InvariantWallet private wallet2;
    SpicaCashInvariantHandler private handler;

    function setUp() public {
        token = new SpicaCash(address(this), INITIAL_SUPPLY);
        wallet0 = new InvariantWallet();
        wallet1 = new InvariantWallet();
        wallet2 = new InvariantWallet();

        uint256 oneThird = INITIAL_SUPPLY / 3;
        require(token.transfer(address(wallet0), oneThird), "setup transfer 0 failed");
        require(token.transfer(address(wallet1), oneThird), "setup transfer 1 failed");
        require(
            token.transfer(address(wallet2), INITIAL_SUPPLY - 2 * oneThird),
            "setup transfer 2 failed"
        );

        handler = new SpicaCashInvariantHandler(token, wallet0, wallet1, wallet2);
        vm.targetContract(address(handler));
    }

    function invariant_TotalSupplyRemainsFixed() public view {
        require(token.totalSupply() == INITIAL_SUPPLY, "total supply changed");
    }

    function invariant_TrackedBalancesConserveAllTokens() public view {
        uint256 sum =
            token.balanceOf(address(wallet0)) +
            token.balanceOf(address(wallet1)) +
            token.balanceOf(address(wallet2));
        require(sum == INITIAL_SUPPLY, "missing or extra tokens");
    }

    function invariant_NoTokensHeldByHandlerOrFixture() public view {
        require(token.balanceOf(address(handler)) == 0, "handler unexpectedly holds tokens");
        require(token.balanceOf(address(this)) == 0, "fixture unexpectedly holds tokens");
        require(token.balanceOf(address(0)) == 0, "zero address unexpectedly holds tokens");
    }
}
