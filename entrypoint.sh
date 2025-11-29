#!/bin/bash

echo "Waiting for validator at http://solana-validator:8899..."
while ! curl -s http://solana-validator:8899 > /dev/null; do
    sleep 1
done
echo "Validator is up!"

echo "Setting Solana config..."
solana config set --url devnet >/dev/null
solana config set --keypair /app/id.json >/dev/null

if [ -f "/app/id.json" ]; then
  echo "Using keypair: /app/id.json (pubkey: $(solana address 2>/dev/null || echo 'N/A'))"
else
  echo "/app/id.json not found — deploy & PDAs may fail"
fi

exec "$@"