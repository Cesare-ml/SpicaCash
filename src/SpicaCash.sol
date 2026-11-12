// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title SpicaCash
 * @notice Experimental fixed-supply ERC-20 for the VirgoStars ecosystem.
 * @dev No privileged roles, proxy, minting endpoint, transfer tax, or blacklist.
 *      The deployment supply is provided in the token's smallest (18-decimal) units.
 *      This prototype is NOT an authorization to issue a real asset.
 */
contract SpicaCash is ERC20 {
    error InvalidInitialHolder();
    error InitialSupplyMustBePositive();

    /**
     * @param initialHolder Address receiving all units minted at deployment.
     * @param initialSupplyBaseUnits Total fixed supply measured in 10^-18 SPICA units.
     */
    constructor(address initialHolder, uint256 initialSupplyBaseUnits)
        ERC20("SpicaCash", "SPICA")
    {
        if (initialHolder == address(0)) revert InvalidInitialHolder();
        if (initialSupplyBaseUnits == 0) revert InitialSupplyMustBePositive();

        _mint(initialHolder, initialSupplyBaseUnits);
    }
}
