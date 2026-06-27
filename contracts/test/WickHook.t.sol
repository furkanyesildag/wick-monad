// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "v4-core/test/utils/Deployers.sol";
import {HookMiner} from "v4-periphery/test/shared/HookMiner.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {WickHook} from "../src/WickHook.sol";

/// @notice Proves WickHook is a real, deployable Uniswap v4 hook: it mines a permissioned
/// hook address, deploys against a fresh PoolManager, initializes a dynamic-fee pool, and
/// shows the agent's `reprice()` widening the fee that `beforeSwap` enforces on a live swap.
contract WickHookTest is Test, Deployers {
    WickHook hook;

    uint24 constant BASE_FEE_PIPS = 500; // 0.05%
    uint24 constant MAX_FEE_PIPS = 50_000; // 5%

    function setUp() public {
        deployFreshManagerAndRouters();
        (Currency c0, Currency c1) = deployMintAndApprove2Currencies();

        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);
        bytes memory ctorArgs = abi.encode(manager, BASE_FEE_PIPS, MAX_FEE_PIPS);
        (address hookAddr, bytes32 salt) =
            HookMiner.find(address(this), flags, type(WickHook).creationCode, ctorArgs);

        hook = new WickHook{salt: salt}(manager, BASE_FEE_PIPS, MAX_FEE_PIPS);
        require(address(hook) == hookAddr, "hook address mismatch");

        // Dynamic-fee pool with the hook attached.
        (key,) = initPoolAndAddLiquidity(c0, c1, IHooks(address(hook)), LPFeeLibrary.DYNAMIC_FEE_FLAG, SQRT_PRICE_1_1);
    }

    function testHookMinedWithCorrectFlags() public view {
        uint160 addr = uint160(address(hook));
        assertGt(addr & Hooks.BEFORE_SWAP_FLAG, 0, "beforeSwap flag missing");
        assertGt(addr & Hooks.AFTER_SWAP_FLAG, 0, "afterSwap flag missing");
    }

    function testRepriceWidensFeeAndSwapRoutesThroughHook() public {
        // Calm market: floor fee.
        assertEq(hook.dynamicFeePips(), BASE_FEE_PIPS);

        // Agent reprices with 2% volatility -> fee widens to protect LPs.
        hook.reprice(2000e18, 200);
        assertGt(hook.dynamicFeePips(), BASE_FEE_PIPS, "fee should widen with volatility");
        assertEq(hook.pegPrice(), 2000e18);

        // A live swap routes through beforeSwap (which applies the dynamic fee) without reverting.
        BalanceDelta delta = swap(key, true, -1e15, ZERO_BYTES);
        assertTrue(BalanceDelta.unwrap(delta) != 0, "swap should move balances");
    }
}
