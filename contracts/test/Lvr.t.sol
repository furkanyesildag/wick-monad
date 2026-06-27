// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {PassivePool} from "../src/PassivePool.sol";
import {WickPool} from "../src/WickPool.sol";

/// @notice Proves the core thesis under a realistic market model:
///   - ARB flow: every block, an optimal arbitrageur drags the *passive* pool back to the
///     fresh oracle price, pocketing the LVR. WICK is repriced first, so the arb finds no
///     edge there and skips it.
///   - RETAIL flow: benign trades hit BOTH pools and pay the fee/spread.
/// Result: passive LP markout climbs positive (bleeding to arbs), WICK goes negative (earning).
contract LvrTest is Test {
    MockERC20 baseTok;
    MockERC20 quoteTok;
    PriceOracle oracle;
    PassivePool passive;
    WickPool wick;

    address arb = address(0xB0B);
    address retail = address(0xCA11);

    uint256 constant START_PRICE = 2000e18; // 1 WMON = 2000 USDC
    uint256 constant SEED_BASE = 200e18;
    uint256 constant SEED_QUOTE = 400_000e18;

    function setUp() public {
        oracle = new PriceOracle(START_PRICE);
        baseTok = new MockERC20("Wrapped Monad", "WMON", 18);
        quoteTok = new MockERC20("USD Coin", "USDC", 18);
        passive = new PassivePool(baseTok, quoteTok, oracle, 30); // 0.30% static
        wick = new WickPool(baseTok, quoteTok, oracle, 5, 500); // 0.05% floor, 5% cap

        _seed(address(passive));
        _seed(address(wick));

        _fund(arb);
        _fund(retail);
    }

    function _seed(address pool) internal {
        baseTok.mint(address(this), SEED_BASE);
        quoteTok.mint(address(this), SEED_QUOTE);
        baseTok.approve(pool, SEED_BASE);
        quoteTok.approve(pool, SEED_QUOTE);
        (bool ok,) =
            pool.call(abi.encodeWithSignature("addLiquidity(uint256,uint256)", SEED_BASE, SEED_QUOTE));
        require(ok, "seed failed");
    }

    function _fund(address who) internal {
        baseTok.mint(who, 100_000e18);
        quoteTok.mint(who, 200_000_000e18);
        vm.startPrank(who);
        baseTok.approve(address(passive), type(uint256).max);
        quoteTok.approve(address(passive), type(uint256).max);
        baseTok.approve(address(wick), type(uint256).max);
        quoteTok.approve(address(wick), type(uint256).max);
        vm.stopPrank();
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /// @dev Optimal arb that drags the passive (x*y=k) pool to external price P.
    function _arbPassive(uint256 P) internal {
        uint256 Rb = passive.reserveBase();
        uint256 Rq = passive.reserveQuote();
        uint256 k = Rb * Rq;
        uint256 targetRb = _sqrt((k / P) * 1e18); // sqrt(k * 1e18 / P)
        if (targetRb == 0) return;

        vm.startPrank(arb);
        if (targetRb < Rb) {
            // base undervalued in pool -> arb buys base with quote
            uint256 quoteIn = (k / targetRb) - Rq;
            if (quoteIn > 0) passive.swap(false, quoteIn, 0);
        } else if (targetRb > Rb) {
            // base overvalued in pool -> arb sells base
            uint256 baseIn = targetRb - Rb;
            if (baseIn > 0) passive.swap(true, baseIn, 0);
        }
        vm.stopPrank();
    }

    function _retail(uint256 seed) internal {
        bool sellBase = seed % 2 == 0;
        uint256 sizeBase = 2e17 + (seed % 5) * 1e17; // 0.2 - 0.6 WMON
        vm.startPrank(retail);
        if (sellBase) {
            passive.swap(true, sizeBase, 0);
            wick.swap(true, sizeBase, 0);
        } else {
            uint256 sizeQuote = (sizeBase * oracle.price()) / 1e18;
            passive.swap(false, sizeQuote, 0);
            wick.swap(false, sizeQuote, 0);
        }
        vm.stopPrank();
    }

    function testLvrDivergence() public {
        uint256 price = START_PRICE;

        for (uint256 i = 0; i < 30; i++) {
            vm.roll(block.number + 1);

            // 1) Oracle moves (pseudo-random walk +/- up to 1%, with a vol shock at block 15).
            uint256 seed = uint256(keccak256(abi.encode(i, "wick")));
            int256 bps = int256(seed % 201) - 100; // -100..+100 bps
            if (i == 15) bps = 500; // +5% volatility shock
            uint256 prev = price;
            price = uint256(int256(price) + (int256(price) * bps) / 10_000);
            oracle.pushPrice(price);

            // 2) WICK agent reprices to the fresh fair price (passive does nothing).
            wick.reprice(price, oracle.volatilityBps());

            // 3) Arbitrageur drags the stale passive pool to fair (skips WICK — no edge).
            if (price != prev) _arbPassive(price);

            // 4) Benign retail flow hits both pools and pays the spread.
            _retail(seed);
        }

        int256 passiveLvr = passive.lpMarkout();
        int256 wickLvr = wick.lpMarkout();

        emit log_named_decimal_int("PASSIVE  net LP markout (USDC)", passiveLvr, 18);
        emit log_named_decimal_int("WICK     net LP markout (USDC)", wickLvr, 18);

        assertGt(passiveLvr, 0, "passive should bleed to arbs");
        assertLt(wickLvr, 0, "wick LPs should earn the spread");
        assertLt(wickLvr, passiveLvr, "wick must beat passive");
    }
}
