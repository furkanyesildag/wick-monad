// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @notice Shared LP accounting + markout (LVR) tracking for the two demo pools.
/// @dev Children only differ in how a swap is priced (`_quoteOut`). Everything
/// else — liquidity, reserves, and the LVR counter that the demo lives on — is shared.
abstract contract LiquidityPool {
    using SafeERC20 for IERC20;

    IERC20 public immutable base; // e.g. WMON
    IERC20 public immutable quote; // e.g. USDC
    IPriceOracle public immutable oracle;

    uint256 public reserveBase;
    uint256 public reserveQuote;

    uint256 public totalShares;
    mapping(address => uint256) public shares;

    /// @notice Cumulative LP value lost to flow, measured at the oracle mid (quote units, 1e18).
    /// Positive = LPs are bleeding to arbitrageurs (LVR). Negative = LPs are earning the spread.
    int256 public lpMarkout;

    event LiquidityAdded(address indexed who, uint256 baseAmount, uint256 quoteAmount, uint256 sharesMinted);
    event LiquidityRemoved(address indexed who, uint256 baseAmount, uint256 quoteAmount, uint256 sharesBurned);
    event Swap(
        address indexed who,
        bool baseIn,
        uint256 amountIn,
        uint256 amountOut,
        uint256 execPrice,
        int256 markoutDelta,
        int256 lpMarkout
    );

    error ZeroAmount();
    error BadRatio();
    error InsufficientLiquidity();
    error Slippage();

    constructor(IERC20 base_, IERC20 quote_, IPriceOracle oracle_) {
        base = base_;
        quote = quote_;
        oracle = oracle_;
    }

    // --------------------------------------------------------------------- //
    //                              Liquidity                                //
    // --------------------------------------------------------------------- //

    /// @notice Seed or add liquidity. After the first deposit, amounts must match the current ratio.
    function addLiquidity(uint256 baseAmount, uint256 quoteAmount) external returns (uint256 minted) {
        if (baseAmount == 0 || quoteAmount == 0) revert ZeroAmount();

        if (totalShares == 0) {
            // Initial deposit: shares = quote-equivalent notional at the oracle mid.
            minted = quoteAmount + (baseAmount * oracle.price()) / 1e18;
        } else {
            // Must add in the existing reserve ratio (within rounding tolerance).
            uint256 expectedQuote = (baseAmount * reserveQuote) / reserveBase;
            uint256 diff = quoteAmount > expectedQuote ? quoteAmount - expectedQuote : expectedQuote - quoteAmount;
            if (diff > expectedQuote / 100) revert BadRatio(); // >1% off
            minted = (baseAmount * totalShares) / reserveBase;
        }

        base.safeTransferFrom(msg.sender, address(this), baseAmount);
        quote.safeTransferFrom(msg.sender, address(this), quoteAmount);

        reserveBase += baseAmount;
        reserveQuote += quoteAmount;
        totalShares += minted;
        shares[msg.sender] += minted;

        emit LiquidityAdded(msg.sender, baseAmount, quoteAmount, minted);
    }

    function removeLiquidity(uint256 sharesAmount) external returns (uint256 baseOut, uint256 quoteOut) {
        if (sharesAmount == 0) revert ZeroAmount();
        uint256 ts = totalShares;
        baseOut = (reserveBase * sharesAmount) / ts;
        quoteOut = (reserveQuote * sharesAmount) / ts;

        shares[msg.sender] -= sharesAmount;
        totalShares -= sharesAmount;
        reserveBase -= baseOut;
        reserveQuote -= quoteOut;

        base.safeTransfer(msg.sender, baseOut);
        quote.safeTransfer(msg.sender, quoteOut);

        emit LiquidityRemoved(msg.sender, baseOut, quoteOut, sharesAmount);
    }

    // --------------------------------------------------------------------- //
    //                                Swap                                   //
    // --------------------------------------------------------------------- //

    /// @notice Exact-input swap. `baseIn = true` sells base for quote.
    function swap(bool baseIn, uint256 amountIn, uint256 minOut) external returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();

        uint256 execPrice;
        (amountOut, execPrice) = _quoteOut(baseIn, amountIn);
        if (amountOut < minOut) revert Slippage();

        if (baseIn) {
            if (amountOut >= reserveQuote) revert InsufficientLiquidity();
            base.safeTransferFrom(msg.sender, address(this), amountIn);
            quote.safeTransfer(msg.sender, amountOut);
            reserveBase += amountIn;
            reserveQuote -= amountOut;
        } else {
            if (amountOut >= reserveBase) revert InsufficientLiquidity();
            quote.safeTransferFrom(msg.sender, address(this), amountIn);
            base.safeTransfer(msg.sender, amountOut);
            reserveQuote += amountIn;
            reserveBase -= amountOut;
        }

        int256 delta = _markout(baseIn, amountIn, amountOut);
        lpMarkout += delta;

        emit Swap(msg.sender, baseIn, amountIn, amountOut, execPrice, delta, lpMarkout);
    }

    /// @dev Quote of `amountOut` (and the execution price, quote-per-base 1e18) for a swap.
    function _quoteOut(bool baseIn, uint256 amountIn) internal view virtual returns (uint256 amountOut, uint256 execPrice);

    /// @dev LP value lost to this trade at the oracle mid (quote units, 1e18). Positive = LP loss.
    function _markout(bool baseIn, uint256 amountIn, uint256 amountOut) internal view returns (int256) {
        uint256 mid = oracle.price();
        if (baseIn) {
            // Trader gives base, receives quote. LP loss = quoteOut - value(baseIn).
            return int256(amountOut) - int256((amountIn * mid) / 1e18);
        } else {
            // Trader gives quote, receives base. LP loss = value(baseOut) - quoteIn.
            return int256((amountOut * mid) / 1e18) - int256(amountIn);
        }
    }

    // --------------------------------------------------------------------- //
    //                                Views                                  //
    // --------------------------------------------------------------------- //

    /// @notice LP equity valued at the oracle mid (quote units, 1e18).
    function lpEquityQuote() external view returns (uint256) {
        return reserveQuote + (reserveBase * oracle.price()) / 1e18;
    }

    /// @notice The pool's current marginal price (quote per base, 1e18) and effective spread in bps.
    function quotedPrice() public view virtual returns (uint256 price, uint256 spreadBps);
}
