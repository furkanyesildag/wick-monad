// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {LiquidityPool} from "./LiquidityPool.sol";

/// @notice The WICK pool: an autonomous-market-maker AMM.
/// @dev A keeper (the OpenClaw agent) calls `reprice()` every block to peg the pool's
/// quote to the fresh oracle price and to set a volatility-aware dynamic fee. Because the
/// quote is never stale, arbitrageurs have nothing to skim — they instead pay the spread,
/// so `lpMarkout` trends *negative* (LPs earn). This is the same beforeSwap/afterSwap
/// repricing + dynamic-fee logic as the Uniswap v4 `WickHook`, in standalone form so the
/// side-by-side demo is fully deterministic.
contract WickPool is LiquidityPool {
    address public keeper;

    uint256 public pegPrice; // current quoted mid (quote per base, 1e18)
    uint256 public dynamicFeeBps; // half-spread applied around the peg
    uint256 public lastRepriceBlock;

    uint256 public immutable baseFeeBps; // floor half-spread
    uint256 public immutable maxFeeBps; // cap, protects LPs in extreme vol
    uint256 public constant DEVIATION_LOCK_BPS = 1_000; // 10% oracle-vs-peg gap => locked

    event Repriced(uint256 pegPrice, uint256 dynamicFeeBps, uint256 volatilityBps, uint256 blockNumber);
    event KeeperUpdated(address keeper);

    error NotKeeper();
    error PoolLocked();

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    constructor(
        IERC20 base_,
        IERC20 quote_,
        IPriceOracle oracle_,
        uint256 baseFeeBps_,
        uint256 maxFeeBps_
    ) LiquidityPool(base_, quote_, oracle_) {
        keeper = msg.sender;
        baseFeeBps = baseFeeBps_;
        maxFeeBps = maxFeeBps_;
        pegPrice = oracle_.price();
        dynamicFeeBps = baseFeeBps_;
        lastRepriceBlock = block.number;
    }

    function setKeeper(address newKeeper) external onlyKeeper {
        keeper = newKeeper;
        emit KeeperUpdated(newKeeper);
    }

    /// @notice The agent's per-block action: peg to the fresh fair price and widen/tighten
    /// the spread with volatility. This is what closes the staleness window.
    function reprice(uint256 fairPrice, uint256 volatilityBps) external onlyKeeper {
        pegPrice = fairPrice;
        uint256 fee = baseFeeBps + volatilityBps / 2; // widen with vol
        if (fee > maxFeeBps) fee = maxFeeBps;
        dynamicFeeBps = fee;
        lastRepriceBlock = block.number;
        emit Repriced(fairPrice, fee, volatilityBps, block.number);
    }

    function _quoteOut(bool baseIn, uint256 amountIn)
        internal
        view
        override
        returns (uint256 amountOut, uint256 execPrice)
    {
        // Safety: if the live oracle has drifted far from the peg (agent stalled / oracle
        // manipulated), lock swaps so LP losses are bounded.
        uint256 mid = oracle.price();
        uint256 gap = mid > pegPrice ? mid - pegPrice : pegPrice - mid;
        if (pegPrice != 0 && (gap * 10_000) / pegPrice > DEVIATION_LOCK_BPS) revert PoolLocked();

        if (baseIn) {
            // Trader sells base; receives quote at peg discounted by the half-spread.
            execPrice = (pegPrice * (10_000 - dynamicFeeBps)) / 10_000;
            amountOut = (amountIn * execPrice) / 1e18;
        } else {
            // Trader buys base; pays peg marked up by the half-spread.
            execPrice = (pegPrice * (10_000 + dynamicFeeBps)) / 10_000;
            amountOut = (amountIn * 1e18) / execPrice;
        }
    }

    function quotedPrice() public view override returns (uint256 price, uint256 spreadBps) {
        price = pegPrice;
        spreadBps = dynamicFeeBps;
    }
}
