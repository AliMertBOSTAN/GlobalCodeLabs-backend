#!/bin/sh
set -e
ADDRESSES_FILE="/app/deploy-output/addresses.json"
echo "============================================"
echo "  MERT Token Exchange - Backend Starting"
echo "============================================"
mkdir -p /app/db-data
if [ ! -L /app/data.db ]; then
  rm -f /app/data.db
  ln -sf /app/db-data/data.db /app/data.db
fi
echo ""
echo "[INFO] Waiting for contract addresses..."
RETRY=0
MAX_RETRY=60
while [ ! -f "$ADDRESSES_FILE" ]; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRY ]; then
    echo "[ERROR] Contract addresses not found! ($ADDRESSES_FILE)"
    echo "        Did the deployer service run correctly?"
    exit 1
  fi
  echo "[WAIT] Attempt $RETRY/$MAX_RETRY ..."
  sleep 2
done
echo "[OK] Contract addresses found!"
echo ""
export ORACLE_ADDRESS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ADDRESSES_FILE','utf8')).ORACLE_ADDRESS)")
export TOKEN_ADDRESS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ADDRESSES_FILE','utf8')).TOKEN_ADDRESS)")
export SALE_ADDRESS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ADDRESSES_FILE','utf8')).SALE_ADDRESS)")
export ADMIN_PRIVATE_KEY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ADDRESSES_FILE','utf8')).ADMIN_PRIVATE_KEY)")
export ADMIN_ADDRESS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ADDRESSES_FILE','utf8')).ADMIN_ADDRESS)")
export POOL_ADDRESS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ADDRESSES_FILE','utf8')).POOL_ADDRESS)")
export POOL_PRIVATE_KEY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ADDRESSES_FILE','utf8')).POOL_PRIVATE_KEY)")
export PRICE_DECIMALS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ADDRESSES_FILE','utf8')).PRICE_DECIMALS)")
export TOKEN_DECIMALS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ADDRESSES_FILE','utf8')).TOKEN_DECIMALS)")
echo "[CONFIG] Loaded contract addresses:"
echo "   ORACLE  : $ORACLE_ADDRESS"
echo "   TOKEN   : $TOKEN_ADDRESS"
echo "   SALE    : $SALE_ADDRESS"
echo "   POOL    : $POOL_ADDRESS"
echo "   RPC_URL : $RPC_URL"
echo "   PORT    : $PORT"
echo ""
echo "[START] Launching backend server..."
exec node src/app.js
