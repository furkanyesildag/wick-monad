import "server-only";
import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import deploymentJson from "./deployment.json";

const RPC = process.env.RPC_URL || "http://localhost:8545";
const PK = (process.env.AGENT_PK ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;

type Deployment = {
  chainId: number;
  deployer: `0x${string}`;
  oracle: `0x${string}`;
  wmon: `0x${string}`;
  usdc: `0x${string}`;
  passive: `0x${string}`;
  wick: `0x${string}`;
  vault?: `0x${string}`;
  startPrice: string;
};

export const deployment = deploymentJson as Deployment;

export const chain = defineChain({
  id: Number(deployment.chainId),
  name: deployment.chainId === 10143 ? "Monad Testnet" : "Local",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  // Multicall3 is canonical on Monad — lets viem collapse concurrent reads into one
  // RPC request, which keeps us under the public RPC's 15 req/s limit.
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

export const account = privateKeyToAccount(PK);
export const pub = createPublicClient({
  chain,
  transport: http(RPC),
  batch: { multicall: { wait: 16 } },
  pollingInterval: 300,
});
export const wallet = createWalletClient({ account, chain, transport: http(RPC) });

export const ADDR = {
  oracle: deployment.oracle,
  wmon: deployment.wmon,
  usdc: deployment.usdc,
  passive: deployment.passive,
  wick: deployment.wick,
  vault: deployment.vault,
};

export const WAD = 10n ** 18n;

export const oracleAbi = [
  { type: "function", name: "pushPrice", stateMutability: "nonpayable", inputs: [{ name: "newPrice", type: "uint256" }], outputs: [] },
  { type: "function", name: "price", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "volatilityBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const poolAbi = [
  { type: "function", name: "reserveBase", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reserveQuote", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lpMarkout", stateMutability: "view", inputs: [], outputs: [{ type: "int256" }] },
  { type: "function", name: "lpEquityQuote", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "quotedPrice", stateMutability: "view", inputs: [], outputs: [{ name: "price", type: "uint256" }, { name: "spreadBps", type: "uint256" }] },
  { type: "function", name: "totalShares", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "shares", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "swap", stateMutability: "nonpayable", inputs: [{ name: "baseIn", type: "bool" }, { name: "amountIn", type: "uint256" }, { name: "minOut", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "addLiquidity", stateMutability: "nonpayable", inputs: [{ name: "baseAmount", type: "uint256" }, { name: "quoteAmount", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

export const wickAbi = [
  ...poolAbi,
  { type: "function", name: "reprice", stateMutability: "nonpayable", inputs: [{ name: "fairPrice", type: "uint256" }, { name: "volatilityBps", type: "uint256" }], outputs: [] },
  { type: "function", name: "pegPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "dynamicFeeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const erc20Abi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
