// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IPriceOracle {
    /// @notice Quote-token amount per 1 base token, scaled by 1e18.
    function price() external view returns (uint256);

    /// @notice Most recent volatility estimate in basis points (abs pct move).
    function volatilityBps() external view returns (uint256);
}
