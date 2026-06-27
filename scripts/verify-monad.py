#!/usr/bin/env python3
"""Verify the WICK contracts on Monad explorers via the monskills verification API."""
import json, subprocess, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTRACTS = os.path.join(ROOT, "contracts")
COMPILER = "v0.8.26+commit.8a97fa7a"
API = "https://agents.devnads.com/v1/verify"

dep = json.load(open(os.path.join(CONTRACTS, "deployments", "monad-testnet.json")))

# name -> (sol:Contract, address, ctor signature, [args])
TARGETS = [
    ("PriceOracle", "src/PriceOracle.sol:PriceOracle", dep["oracle"],
     "constructor(uint256)", ["2000000000000000000000"]),
    ("MockERC20-WMON", "src/MockERC20.sol:MockERC20", dep["wmon"],
     "constructor(string,string,uint8)", ["Wrapped Monad", "WMON", "18"]),
    ("MockERC20-USDC", "src/MockERC20.sol:MockERC20", dep["usdc"],
     "constructor(string,string,uint8)", ["USD Coin", "USDC", "18"]),
    ("PassivePool", "src/PassivePool.sol:PassivePool", dep["passive"],
     "constructor(address,address,address,uint256)", [dep["wmon"], dep["usdc"], dep["oracle"], "30"]),
    ("WickPool", "src/WickPool.sol:WickPool", dep["wick"],
     "constructor(address,address,address,uint256,uint256)", [dep["wmon"], dep["usdc"], dep["oracle"], "5", "500"]),
    ("WickVault", "src/WickVault.sol:WickVault", dep["vault"], "constructor()", []),
]


def run(cmd):
    return subprocess.run(cmd, cwd=CONTRACTS, capture_output=True, text=True)


def main():
    env = dict(os.environ, PATH=os.path.expanduser("~/.foundry/bin") + ":" + os.environ["PATH"])
    for label, cname, addr, sig, args in TARGETS:
        print(f"\n=== {label} @ {addr} ===")
        sji = subprocess.run(
            ["forge", "verify-contract", addr, cname, "--chain", "10143", "--show-standard-json-input"],
            cwd=CONTRACTS, capture_output=True, text=True, env=env)
        if sji.returncode != 0:
            print("  ✗ standard-json failed:", sji.stderr[:200]); continue
        standard_input = json.loads(sji.stdout)

        path_part, contract = cname.split(":")
        sol_file = os.path.basename(path_part)
        out_file = os.path.join(CONTRACTS, "out", sol_file, contract + ".json")
        meta = json.load(open(out_file))["metadata"]
        metadata = json.loads(meta) if isinstance(meta, str) else meta

        enc = subprocess.run(["cast", "abi-encode", sig] + args, cwd=CONTRACTS,
                             capture_output=True, text=True, env=env)
        ctor_args = enc.stdout.strip()
        if ctor_args.startswith("0x"):
            ctor_args = ctor_args[2:]

        payload = {
            "chainId": 10143,
            "contractAddress": addr,
            "contractName": cname,
            "compilerVersion": COMPILER,
            "standardJsonInput": standard_input,
            "foundryMetadata": metadata,
            "constructorArgs": ctor_args,
        }
        req = urllib.request.Request(API, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                print("  →", r.status, r.read().decode()[:300])
        except urllib.error.HTTPError as e:
            print("  ✗ HTTP", e.code, e.read().decode()[:300])
        except Exception as e:
            print("  ✗", str(e)[:200])


if __name__ == "__main__":
    main()
