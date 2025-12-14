#!/bin/bash
# Wrapper script for sync-rules that can be added to PATH
# Usage: sync-rules [options]

# Find the Memory project root (where this script is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if tsx is available
if [ -f "$MEMORY_ROOT/node_modules/.bin/tsx" ]; then
  TSX="$MEMORY_ROOT/node_modules/.bin/tsx"
elif command -v tsx >/dev/null 2>&1; then
  TSX="tsx"
else
  echo "Error: tsx not found. Please install dependencies in $MEMORY_ROOT" >&2
  exit 1
fi

# Run the sync-rules script
exec "$TSX" "$MEMORY_ROOT/scripts/sync-rules.ts" "$@"







