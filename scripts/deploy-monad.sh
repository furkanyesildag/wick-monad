#!/usr/bin/env bash
# Deploy the WICK stack to Monad testnet and point the dashboard at it.
# Prereq: the agent wallet (0x85f57a0a258A3dF575301799DCac4a6c4f442681) must be funded
# with testnet MON from https://faucet.monad.xyz
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="https://testnet-rpc.monad.xyz"
KEYSTORE_DIR="$HOME/.monskills/keystore"

KEYFILE="$(ls "$KEYSTORE_DIR" | head -1)"
echo "→ decrypting agent keystore ($KEYFILE)…"
PK="$(cast wallet decrypt-keystore --keystore-dir "$KEYSTORE_DIR" "$KEYFILE" --unsafe-password "" | awk '{print $NF}')"
ADDR="$(cast wallet address --private-key "$PK")"
echo "→ agent: $ADDR"

BAL="$(cast balance "$ADDR" --rpc-url "$RPC")"
if [ "$BAL" = "0" ]; then
  echo "✗ wallet has 0 MON. Fund $ADDR at https://faucet.monad.xyz then re-run."
  exit 1
fi
echo "→ balance: $BAL wei — deploying…"

cd "$ROOT/contracts"
PRIVATE_KEY="$PK" forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast --slow

echo "→ pointing web/.env.local at Monad testnet…"
cat > "$ROOT/web/.env.local" <<EOF
RPC_URL=$RPC
AGENT_PK=$PK
EOF

echo "✓ deployed. Addresses written to contracts/deployments/monad-testnet.json"
echo "✓ restart the dashboard:  cd web && npm run dev"
cat "$ROOT/contracts/deployments/monad-testnet.json"
