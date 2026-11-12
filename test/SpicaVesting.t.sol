// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";
import {SpicaCash} from "../src/SpicaCash.sol";

/**
 * @notice Experimental reference tests for OpenZeppelin's linear VestingWallet.
 * @dev No additional vesting contract or distribution mechanism is deployed.
 *      Synthetic amounts/timestamps are test fixtures, NOT tokenomics.
 */
interface VmTime {
    function warp(uint256 timestamp) external;
}

contract SpicaVestingTest {
    VmTime internal constant vm = VmTime(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint64 internal constant START = 2_000_000_000;
    uint64 internal constant DURATION = 90 days;
    uint256 internal constant TEST_SUPPLY = 1_000_000 * 1e18;
    uint256 internal constant GRANT = 900 * 1e18;
    address internal constant BENEFICIARY = address(0xBEEF);
    address internal constant NEW_BENEFICIARY = address(0xCAFE);

    function _fixture() internal returns (SpicaCash token, VestingWallet vesting) {
        token = new SpicaCash(address(this), TEST_SUPPLY);
        vesting = new VestingWallet(BENEFICIARY, START, DURATION);
        require(token.transfer(address(vesting), GRANT), "fund fixture failed");
        require(token.balanceOf(address(vesting)) == GRANT, "missing deposit");
    }

    function testNoReleaseBeforeStart() public {
        (SpicaCash token, VestingWallet vesting) = _fixture();
        vm.warp(uint256(START) - 1);
        require(vesting.releasable(address(token)) == 0, "unvested tokens releasable");
        vesting.release(address(token));
        require(token.balanceOf(BENEFICIARY) == 0, "early release occurred");
        require(token.balanceOf(address(vesting)) == GRANT, "vesting balance changed");
        require(token.totalSupply() == TEST_SUPPLY, "supply changed");
    }

    function testLinearHalfwayAndEndRelease() public {
        (SpicaCash token, VestingWallet vesting) = _fixture();
        vm.warp(uint256(START) + uint256(DURATION) / 2);
        require(vesting.releasable(address(token)) == GRANT / 2, "wrong halfway releasable");
        // A third party calls release; the funds must still go to the owner/beneficiary.
        vesting.release(address(token));
        require(token.balanceOf(BENEFICIARY) == GRANT / 2, "wrong halfway payout");
        require(vesting.released(address(token)) == GRANT / 2, "wrong released total");

        vm.warp(uint256(START) + uint256(DURATION));
        require(vesting.releasable(address(token)) == GRANT / 2, "wrong final release amount");
        vesting.release(address(token));
        require(token.balanceOf(BENEFICIARY) == GRANT, "final beneficiary mismatch");
        require(token.balanceOf(address(vesting)) == 0, "wallet not empty");
        require(vesting.releasable(address(token)) == 0, "double release possible");
        require(token.totalSupply() == TEST_SUPPLY, "supply changed");
    }

    function testRepeatedReleaseAtSameTimeCannotDoublePay() public {
        (SpicaCash token, VestingWallet vesting) = _fixture();
        vm.warp(uint256(START) + uint256(DURATION) / 3);
        vesting.release(address(token));
        uint256 first = token.balanceOf(BENEFICIARY);
        vesting.release(address(token));
        require(token.balanceOf(BENEFICIARY) == first, "duplicate release");
        require(token.balanceOf(BENEFICIARY) + token.balanceOf(address(vesting)) == GRANT, "grant not conserved");
    }

    function testLateFundingIsImmediatelyPartlyReleasable() public {
        // Documents a deliberate OpenZeppelin behavior / operational risk:
        // depositing AFTER a schedule has started releases past-vested proportion at once.
        SpicaCash token = new SpicaCash(address(this), TEST_SUPPLY);
        VestingWallet vesting = new VestingWallet(BENEFICIARY, START, DURATION);
        vm.warp(uint256(START) + uint256(DURATION) / 2);
        require(token.transfer(address(vesting), GRANT), "late fund failed");
        require(vesting.releasable(address(token)) == GRANT / 2, "unexpected late funding semantics");
        vesting.release(address(token));
        require(token.balanceOf(BENEFICIARY) == GRANT / 2, "late funding payout mismatch");
    }

    function testBeneficiaryOwnershipIsTransferable() public {
        // IMPORTANT: OpenZeppelin VestingWallet is Ownable; beneficial rights can be transferred.
        SpicaCash token = new SpicaCash(address(this), TEST_SUPPLY);
        VestingWallet vesting = new VestingWallet(address(this), START, DURATION);
        require(token.transfer(address(vesting), GRANT), "fund failed");
        vesting.transferOwnership(NEW_BENEFICIARY);
        require(vesting.owner() == NEW_BENEFICIARY, "owner did not change");
        vm.warp(uint256(START) + uint256(DURATION));
        vesting.release(address(token));
        require(token.balanceOf(NEW_BENEFICIARY) == GRANT, "new beneficiary not paid");
        require(token.balanceOf(address(this)) == TEST_SUPPLY - GRANT, "old owner unexpectedly paid");
    }

    function testFuzz_LinearVestingIsBounded(uint32 elapsedSeed) public {
        (SpicaCash token, VestingWallet vesting) = _fixture();
        uint256 elapsed = uint256(elapsedSeed) % (uint256(DURATION) + 1);
        vm.warp(uint256(START) + elapsed);
        uint256 expected = GRANT * elapsed / uint256(DURATION);
        require(vesting.vestedAmount(address(token), block.timestamp) == expected, "curve mismatch");
        require(vesting.releasable(address(token)) == expected, "releasable mismatch");
        require(expected <= GRANT, "over-release possible");
        require(token.totalSupply() == TEST_SUPPLY, "supply changed");
    }
}
