#!/bin/bash
#
# Git Pre-commit Hook for Syncing Rules
#
# This hook syncs rule files from rules/ to IDE formats before committing.
# Install by copying to .git/hooks/pre-commit or running:
#   ln -s ../../scripts/pre-commit-sync.sh .git/hooks/pre-commit
#

set -e

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if sync-rules script exists
SYNC_SCRIPT="$PROJECT_ROOT/scripts/sync-rules.ts"
BUILT_SCRIPT="$PROJECT_ROOT/dist/scripts/sync-rules.js"

if [ ! -f "$SYNC_SCRIPT" ] && [ ! -f "$BUILT_SCRIPT" ]; then
  echo "Warning: sync-rules script not found. Skipping rule sync."
  exit 0
fi

# Run sync (quiet mode to avoid noise in commit process)
cd "$PROJECT_ROOT"

# Check if we have a built version, otherwise use tsx
if [ -f "$BUILT_SCRIPT" ]; then
  node "$BUILT_SCRIPT" --auto-detect --quiet > /dev/null 2>&1 || true
else
  # Check if tsx is available
  if command -v tsx &> /dev/null; then
    tsx "$SYNC_SCRIPT" --auto-detect --quiet > /dev/null 2>&1 || true
  else
    # Skip if tsx not available (development dependency)
    exit 0
  fi
fi

# Stage any changes made by sync
if [ -n "$(git diff --cached --name-only)" ]; then
  # If there are already staged files, add any new/modified rule files
  git add .cursor/rules/*.mdc .vscode/rules/*.md .ide-rules/*.md 2>/dev/null || true
fi

exit 0































