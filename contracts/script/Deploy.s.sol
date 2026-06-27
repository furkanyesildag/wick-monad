// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {PassivePool} from "../src/PassivePool.sol";
import {WickPool} from "../src/WickPool.sol";

/// @notice Deploys the WICK demo stack to Monad testnet, seeds both pools with identical
/// liquidity, and mints trading inventory to the deployer (the agent) for the live loop.
contract Deploy is Script {
    uint256 constant START_PRICE = 2000e18; // 1 WMON = 2000 USDC
    uint256 constant SEED_BASE = 200e18;
    uint256 constant SEED_QUOTE = 400_000e18;
    uint256 constant AGENT_BASE = 200_000e18;
    uint256 constant AGENT_QUOTE = 400_000_000e18;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);

        vm.startBroadcast(pk);

        PriceOracle oracle = new PriceOracle(START_PRICE);
        MockERC20 wmon = new MockERC20("Wrapped Monad", "WMON", 18);
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 18);
        PassivePool passive = new PassivePool(wmon, usdc, oracle, 30); // 0.30% static
        WickPool wick = new WickPool(wmon, usdc, oracle, 5, 500); // 0.05% floor, 5% cap

        // Seed both pools with identical liquidity.
        wmon.mint(me, SEED_BASE * 2);
        usdc.mint(me, SEED_QUOTE * 2);
        wmon.approve(address(passive), SEED_BASE);
        usdc.approve(address(passive), SEED_QUOTE);
        passive.addLiquidity(SEED_BASE, SEED_QUOTE);
        wmon.approve(address(wick), SEED_BASE);
        usdc.approve(address(wick), SEED_QUOTE);
        wick.addLiquidity(SEED_BASE, SEED_QUOTE);

        // Mint trading inventory for the agent loop (arb + retail flow).
        wmon.mint(me, AGENT_BASE);
        usdc.mint(me, AGENT_QUOTE);

        vm.stopBroadcast();

        console2.log("oracle  ", address(oracle));
        console2.log("wmon    ", address(wmon));
        console2.log("usdc    ", address(usdc));
        console2.log("passive ", address(passive));
        console2.log("wick    ", address(wick));

        // Write a deployments file the agent + frontend consume.
        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "deployer", me);
        vm.serializeAddress(obj, "oracle", address(oracle));
        vm.serializeAddress(obj, "wmon", address(wmon));
        vm.serializeAddress(obj, "usdc", address(usdc));
        vm.serializeAddress(obj, "passive", address(passive));
        vm.serializeUint(obj, "startPrice", START_PRICE);
        string memory output = vm.serializeAddress(obj, "wick", address(wick));

        vm.writeJson(output, "./deployments/monad-testnet.json");
    }
}
