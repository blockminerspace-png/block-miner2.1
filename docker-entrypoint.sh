#!/bin/sh

# BlockMiner Docker Entrypoint
# Initializes database and seeds rewards, then starts the server

set -e

echo "=========================================="
echo "BlockMiner Server - Docker Entrypoint"
echo "=========================================="
echo ""

# Ensure data directory exists
mkdir -p /app/data /app/backups /app/logs

echo "Checking database and rewards..."
node scripts/seed-rewards-data.js

echo ""
echo "Starting BlockMiner server on port 3000..."
echo "=========================================="
echo ""

exec node server.js
