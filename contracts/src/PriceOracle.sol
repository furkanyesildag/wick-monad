// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @notice Demo oracle whose price is driven by the WICK keeper/agent.
/// In production this is replaced by a high-frequency feed (e.g. Pyth/Chainlink);
/// here the agent plays a deterministic price series so the demo is repeatable.
contract PriceOracle is IPriceOracle {
    address public keeper;

    uint256 public price; // quote per 1 base, 1e18
    uint256 public lastPrice;
    uint256 public volatilityBps;
    uint256 public updatedAtBlock;

    event PriceUpdated(uint256 price, uint256 volatilityBps, uint256 blockNumber);
    event KeeperUpdated(address keeper);

    error NotKeeper();

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    constructor(uint256 initialPrice) {
        keeper = msg.sender;
        price = initialPrice;
        lastPrice = initialPrice;
        updatedAtBlock = block.number;
    }

    function setKeeper(address newKeeper) external onlyKeeper {
        keeper = newKeeper;
        emit KeeperUpdated(newKeeper);
    }

    /// @notice Push the next fair price. Volatility is derived as the abs pct move in bps.
    function pushPrice(uint256 newPrice) external onlyKeeper {
        uint256 prev = price;
        lastPrice = prev;
        uint256 diff = newPrice > prev ? newPrice - prev : prev - newPrice;
        volatilityBps = prev == 0 ? 0 : (diff * 10_000) / prev;
        price = newPrice;
        updatedAtBlock = block.number;
        emit PriceUpdated(newPrice, volatilityBps, block.number);
    }
}
