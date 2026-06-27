// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";

/// @title WickHook — the canonical Uniswap v4 form of WICK's market-making logic.
/// @notice Attached to a dynamic-fee v4 pool, this hook does the "logic at the point of
/// exchange" that defines WICK: a keeper (the OpenClaw agent) calls `reprice()` every block
/// with the fresh fair price + volatility, and `beforeSwap` applies a volatility-aware
/// dynamic fee to every trade — widening the spread when the market is moving so LPs aren't
/// picked off, tightening it when it's calm.
///
/// @dev Scope note (intentionally honest): full peg-repricing of the liquidity curve on
/// canonical v4 requires JIT liquidity management via the PoolManager, which is beyond a
/// one-day build. This hook ships the dynamic-fee half natively; the standalone `WickPool`
/// demonstrates the complete peg + dynamic-fee model that the side-by-side demo runs on.
contract WickHook is IHooks {
    using LPFeeLibrary for uint24;

    IPoolManager public immutable poolManager;
    address public keeper;

    uint24 public dynamicFeePips; // current LP fee, in hundredths of a bip (1e6 = 100%)
    uint256 public pegPrice; // last fair price the agent repriced to (reference)
    uint256 public lastRepriceBlock;

    uint24 public immutable baseFeePips; // floor fee
    uint24 public immutable maxFeePips; // cap, protects LPs in extreme vol

    event Repriced(uint256 pegPrice, uint24 dynamicFeePips, uint256 volatilityBps, uint256 blockNumber);
    event KeeperUpdated(address keeper);

    error NotPoolManager();
    error NotKeeper();
    error HookNotImplemented();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    constructor(IPoolManager _poolManager, uint24 _baseFeePips, uint24 _maxFeePips) {
        poolManager = _poolManager;
        keeper = msg.sender;
        baseFeePips = _baseFeePips;
        maxFeePips = _maxFeePips;
        dynamicFeePips = _baseFeePips;
    }

    function setKeeper(address newKeeper) external onlyKeeper {
        keeper = newKeeper;
        emit KeeperUpdated(newKeeper);
    }

    /// @notice The agent's per-block action: record the fresh fair price and set the
    /// volatility-aware dynamic fee that `beforeSwap` will enforce on the next swaps.
    function reprice(uint256 fairPrice, uint256 volatilityBps) external onlyKeeper {
        // bps -> pips (1 bp = 100 pips), widen with volatility
        uint256 feePips = uint256(baseFeePips) + volatilityBps * 100 / 2;
        if (feePips > maxFeePips) feePips = maxFeePips;
        dynamicFeePips = uint24(feePips);
        pegPrice = fairPrice;
        lastRepriceBlock = block.number;
        emit Repriced(fairPrice, uint24(feePips), volatilityBps, block.number);
    }

    /// @notice Permissions this hook needs: (beforeSwap to apply the dynamic fee, afterSwap).
    function getHookPermissions() public pure returns (bool, bool) {
        return (true, true);
    }

    // ---------------------------------------------------------------- //
    //                         Active callbacks                         //
    // ---------------------------------------------------------------- //

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        view
        override
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // Apply the agent's volatility-aware dynamic fee to this swap.
        uint24 feeWithFlag = dynamicFeePips | LPFeeLibrary.OVERRIDE_FEE_FLAG;
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, feeWithFlag);
    }

    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        override
        onlyPoolManager
        returns (bytes4, int128)
    {
        return (IHooks.afterSwap.selector, int128(0));
    }

    // ---------------------------------------------------------------- //
    //                  Unused callbacks (no permission)                //
    // ---------------------------------------------------------------- //

    function beforeInitialize(address, PoolKey calldata, uint160) external pure override returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure override returns (bytes4) {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert HookNotImplemented();
    }
}
