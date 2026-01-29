#!/bin/bash
# Pre-commit hook to ensure migration journal stays in sync

# Check if any migration files were modified
MIGRATION_FILES=$(git diff --cached --name-only | grep "src/db/migrations/.*\.sql")

if [ -n "$MIGRATION_FILES" ]; then
  echo "🔍 Migration files detected in commit..."
  
  # Check if journal was also modified
  JOURNAL_MODIFIED=$(git diff --cached --name-only | grep "src/db/migrations/meta/_journal.json")
  
  if [ -z "$JOURNAL_MODIFIED" ]; then
    echo "❌ ERROR: Migration files modified but journal not updated!"
    echo ""
    echo "Please run: npm run db:sync-journal"
    echo ""
    echo "Modified migrations:"
    echo "$MIGRATION_FILES"
    exit 1
  fi
  
  echo "✅ Migration journal is included in commit"
fi

exit 0
