// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {LiquidityPool} from "./LiquidityPool.sol";

/// @notice A plain constant-product (x*y=k) AMM with a static fee — the "dumb Uniswap".
/// It never reprices, so when the oracle moves, arbitrageurs skim the stale price and
/// `lpMarkout` bleeds upward. This is the baseline WICK is measured against.
contract PassivePool is LiquidityPool {
    uint256 public immutable feeBps;

    constructor(IERC20 base_, IERC20 quote_, IPriceOracle oracle_, uint256 feeBps_)
        LiquidityPool(base_, quote_, oracle_)
    {
        feeBps = feeBps_;
    }

    function _quoteOut(bool baseIn, uint256 amountIn)
        internal
        view
        override
        returns (uint256 amountOut, uint256 execPrice)
    {
        uint256 amountInWithFee = (amountIn * (10_000 - feeBps)) / 10_000;
        if (baseIn) {
            amountOut = (reserveQuote * amountInWithFee) / (reserveBase + amountInWithFee);
            execPrice = amountIn == 0 ? 0 : (amountOut * 1e18) / amountIn;
        } else {
            amountOut = (reserveBase * amountInWithFee) / (reserveQuote + amountInWithFee);
            execPrice = amountOut == 0 ? 0 : (amountIn * 1e18) / amountOut;
        }
    }

    function quotedPrice() public view override returns (uint256 price, uint256 spreadBps) {
        price = reserveBase == 0 ? 0 : (reserveQuote * 1e18) / reserveBase;
        spreadBps = feeBps;
    }
}
