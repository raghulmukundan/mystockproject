#!/bin/sh
set -e

# Ensure dependencies are installed when node_modules is mounted as an empty volume
echo "[entrypoint] Verifying frontend dependencies..."
if [ ! -d node_modules ] || [ ! -f node_modules/@syncfusion/ej2-react-charts/index.js ]; then
  echo "[entrypoint] Installing frontend dependencies..."
  npm install --no-fund --no-audit
else
  echo "[entrypoint] Dependencies already present."
fi

exec "$@"
