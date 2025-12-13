# Rules Sync Guide

This guide explains how to sync rule files from `rules/rules/` to IDE-specific directories, enabling easy setup of rules across different IDEs.

> **Windows users:** For Windows-specific setup instructions, see the [Windows Setup Guide](./windows-setup.md).

## Overview

The sync-rules script copies `.md` files from `rules/rules/` to IDE-specific directories with format conversion, making it easy to:
- Share coding standards across team members using different IDEs
- Keep IDE-specific rule files in sync with your centralized rule files
- Use version control to manage rule changes

## Supported IDEs

- **Cursor** - `.cursor/rules/*.mdc` files (`.md` files are converted to `.mdc` with frontmatter)
- **VS Code** - `.vscode/rules/*.md` files
- **IntelliJ/IDEA** - `.idea/codeStyles/*.md` files
- **Sublime Text** - `.sublime/*.md` files
- **Neovim** - `.nvim/*.md` files
- **Emacs** - `.emacs.d/*.md` files
- **Antigravity** - `.agent/rules/*.md` files
- **Generic** - `.ide-rules/*.md` files (IDE-agnostic format)

## Quick Start

### 1. Create Rule Files

Create `.md` files in the `rules/rules/` directory:

**Unix/Linux/macOS/Windows (PowerShell):**
```powershell
# Create a rule file
@"
# TypeScript Strict Mode

All TypeScript files must use strict mode. Enable 'strict: true' in tsconfig.json.
"@ | Out-File -FilePath rules\rules\typescript-strict.md -Encoding utf8
```

**Windows (CMD):**
```cmd
echo # TypeScript Strict Mode > rules\rules\typescript-strict.md
echo. >> rules\rules\typescript-strict.md
echo All TypeScript files must use strict mode. Enable 'strict: true' in tsconfig.json. >> rules\rules\typescript-strict.md
```

### 2. Sync to Your IDE

Use the CLI to sync rule files to your IDE (works on all platforms):

```bash
# Auto-detect IDE and sync
npm run sync-rules --auto-detect

# Or specify IDE explicitly
npm run sync-rules --ide cursor
```

**Note:** The TypeScript scripts (`npm run sync-rules`) work on all platforms including Windows, without requiring Git Bash or WSL.

That's it! Your IDE-specific rule files are now synced.

## CLI Usage

### Basic Commands

```bash
# Auto-detect IDE and sync
npm run sync-rules --auto-detect

# Sync to specific IDE
npm run sync-rules --ide cursor

# Sync to all IDEs
npm run sync-rules --ide all

# Verify without making changes
npm run sync-rules --ide cursor --verify

# Sync with backup of existing files
npm run sync-rules --ide cursor --backup

# Sync specific files only
npm run sync-rules --ide cursor --files "architecture.mdc,patterns.mdc"

# Write operations to log file
npm run sync-rules --ide cursor --log-file sync.log
```

### Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `--ide <ide>` | IDE to sync to (cursor, vscode, intellij, sublime, neovim, emacs, antigravity, generic, all) | auto-detect |
| `--output <dir>` | Output directory | current directory |
| `--auto-detect` | Auto-detect IDE from workspace | false |
| `--quiet, -q` | Suppress output except errors | false |
| `--verify` | Verification mode (show differences, don't modify) | false |
| `--backup` | Backup existing files before overwrite | false |
| `--files <files>` | Selective sync (comma-separated file list) | - |
| `--log-file <path>` | Write operations to log file | - |

## Watch Mode

Keep rules in sync automatically as you work:

```bash
# Watch for changes and auto-sync
npm run sync-rules:watch

# Watch with custom debounce interval
npm run sync-rules:watch --interval 1000
```

The watcher monitors the `rules/rules/` directory for file changes and automatically syncs when files are created, modified, or deleted.

### Watch Options

| Option | Description | Default |
|--------|-------------|---------|
| `--ide <ide>` | IDE to sync to | auto-detect |
| `--output <dir>` | Output directory | current directory |
| `--interval <ms>` | Debounce time in milliseconds | 500 |
| `--quiet, -q` | Suppress output except errors | false |

## Ignore File

Create a `.rulesignore` file (in project root or `rules/` directory) to exclude files from syncing:

```
README.md
*.tmp
*.bak
```

Patterns support glob syntax:
- `README.md` - Exact filename match
- `*.tmp` - All files ending in `.tmp`
- `**/test.md` - All `test.md` files in any subdirectory

## File Format Conversion

### Cursor (.mdc)

For Cursor IDE, `.md` files are automatically converted to `.mdc` format with frontmatter:

**Source** (`rules/rules/typescript-strict.md`):
```markdown
# TypeScript Strict Mode

All TypeScript files must use strict mode...
```

**Destination** (`.cursor/rules/typescript-strict.mdc`):
```mdc
---
description: typescript strict
---

# TypeScript Strict Mode

All TypeScript files must use strict mode...
```

If the source file already has frontmatter, it's preserved as-is.

### Other IDEs

For other IDEs, files are copied as-is without format conversion.

## Full Sync (Deletion)

By default, the sync script performs a "full sync":
- Files in source (`rules/rules/`) are copied to destination
- Files in destination that don't exist in source are deleted (orphaned files)

This ensures the destination directory exactly matches the source (minus ignored files).

To prevent deletion, use selective sync with `--files` option.

## Verification Mode

Use `--verify` to see what would change without actually modifying files:

```bash
npm run sync-rules --ide cursor --verify
```

This shows:
- Files that would be added
- Files that would be updated
- Files that would be deleted
- Files that are identical (skipped)

Exit code:
- `0` - Everything is in sync
- `2` - Differences found (would need sync)
- `1` - Error occurred

## Backup

Use `--backup` to create backups of existing files before overwriting:

```bash
npm run sync-rules --ide cursor --backup
```

Backups are created as `{filename}.backup.{timestamp}`. The script keeps the last 3 backups and automatically cleans up older ones.

## Selective Sync

Sync only specific files:

```bash
npm run sync-rules --ide cursor --files "architecture.mdc,patterns.mdc"
```

You can specify:
- Filename with extension: `architecture.mdc`
- Filename without extension: `architecture`
- Relative path: `subdir/file.md`

## Logging

Write all operations to a log file:

```bash
npm run sync-rules --ide cursor --log-file sync.log
```

The log file contains:
- Operation type (add, update, delete, skip, error)
- Source and destination paths
- Operation messages
- Timestamps

## Subdirectory Support

The sync script preserves directory structure:

```
rules/rules/
  ├── architecture.mdc
  ├── patterns.mdc
  └── subdir/
      └── testing.mdc
```

Syncs to:

```
.cursor/rules/
  ├── architecture.mdc
  ├── patterns.mdc
  └── subdir/
      └── testing.mdc
```

## Auto-Detection

The sync tool automatically detects your IDE by checking for:

1. **IDE-specific directories**:
   - `.cursor/` → Cursor
   - `.vscode/` → VS Code
   - `.idea/` → IntelliJ
   - `.nvim/` or `.config/nvim/` → Neovim
   - `.emacs.d/` → Emacs
   - `.agent/` → Antigravity

2. **IDE-specific files**:
   - `.sublime-project` → Sublime Text

3. **package.json hints**:
   - Keywords and devDependencies

4. **Environment variables**:
   - `CURSOR`, `VSCODE`, `INTELLIJ_IDEA`, `ANTIGRAVITY`, etc.

## Git Integration

### Pre-commit Hook

Install the pre-commit hook to auto-sync rules before committing:

**Unix/Linux/macOS:**
```bash
# Create symlink
ln -s ../../scripts/pre-commit-sync.sh .git/hooks/pre-commit

# Or copy the script
cp scripts/pre-commit-sync.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**Windows (Git Bash):**
```bash
# Create symlink
ln -s ../../scripts/pre-commit-sync.sh .git/hooks/pre-commit

# Or copy the script
cp scripts/pre-commit-sync.sh .git/hooks/pre-commit
```

**Windows (PowerShell):**
```powershell
# Create symbolic link
New-Item -ItemType SymbolicLink -Path .git\hooks\pre-commit -Target ..\..\scripts\pre-commit-sync.sh

# Or copy the script
Copy-Item scripts\pre-commit-sync.sh .git\hooks\pre-commit
```

**Note:** On Windows, shell scripts require Git Bash or WSL. The TypeScript scripts (`npm run sync-rules`) work on all platforms and can be used as an alternative.

The hook will:
1. Sync rules from `rules/rules/` to IDE formats
2. Automatically stage any modified rule files
3. Run silently (won't add noise to commit process)

## IDE-Specific Formats

### Cursor (.mdc)

Exports to `.cursor/rules/*.mdc` files with frontmatter. **Cursor automatically loads all `.mdc` files from `.cursor/rules/`** - no additional configuration needed.

```mdc
---
description: typescript-strict
globs: ["**/*.ts", "**/*.tsx"]
alwaysApply: true
---

# typescript-strict

All TypeScript files must use strict mode...
```

**Note**: Rules in `.cursor/rules/` are automatically included in Cursor's context. Files with `alwaysApply: true` are always included, and files with `globs` are included when editing matching files.

### VS Code

Exports to `.vscode/rules/*.md` files:

```markdown
# typescript-strict

All TypeScript files must use strict mode...

**Category:** code_style
**Priority:** 90
```

### Generic Format

Exports to `.ide-rules/*.md` files with YAML frontmatter:

```markdown
---
id: typescript-strict
name: typescript-strict
category: code_style
priority: 90
globs: ["**/*.ts", "**/*.tsx"]
alwaysApply: true
tags: ["typescript", "code_style"]
source: rules/rules
---

# typescript-strict

All TypeScript files must use strict mode...
```

## Best Practices

1. **Use Version Control**: Commit rule files in `rules/rules/` to version control
2. **Organize with Subdirectories**: Use subdirectories to organize related rules
3. **Use Ignore File**: Add `.rulesignore` to exclude temporary or documentation files
4. **Use Watch Mode**: For active development, use watch mode to keep rules in sync
5. **Commit Rule Files**: Commit IDE-specific rule files to version control for team sharing
6. **Use Verification**: Before major changes, use `--verify` to preview changes

## Verifying Rules Are Loaded

### Cursor IDE

After syncing, verify rules are loaded:

1. **Check files exist**: Rules should be in `.cursor/rules/*.mdc`
2. **Check Cursor's rule indicator**: Look for the rules indicator in Cursor's UI
3. **Test rule application**: Rules with `alwaysApply: true` should always be in context
4. **Check file-specific rules**: Rules with `globs: ["**/*.ts"]` should load when editing `.ts` files

You can also verify by:
- Opening a chat and asking about a specific rule
- Checking if rule content appears in context automatically
- Looking at the rules panel in Cursor (if available)

## Troubleshooting

### Rules Not Syncing

1. Check source directory exists: Ensure `rules/rules/` directory exists
2. Verify files are `.md` format: Only `.md` files are synced
3. Check ignore file: Files matching `.rulesignore` patterns are excluded
4. Check permissions: Ensure write permissions for output directory

### Rules Not Loading in Cursor

If rules aren't being loaded in Cursor:

1. **Verify directory exists**: Check that `.cursor/rules/` directory exists
2. **Check file format**: Ensure files are `.mdc` format with valid frontmatter
3. **Restart Cursor**: Sometimes Cursor needs a restart to pick up new rules
4. **Check file permissions**: Ensure files are readable
5. **Verify frontmatter**: Check that frontmatter has valid YAML format

Example of valid `.mdc` file:
```mdc
---
description: Rule name
globs: ["**/*.ts"]
alwaysApply: true
---

# Rule content here
```

### IDE Not Detected

1. Manually specify IDE: Use `--ide <ide>` instead of `--auto-detect`
2. Check workspace: Ensure you're running from the project root
3. Create IDE config: Create a basic IDE config file/directory to improve detection

### Watch Mode Not Working

1. Check source directory: Ensure `rules/rules/` directory exists
2. Check file system events: Some file systems don't support recursive watching
3. Increase debounce: Use `--interval` to adjust debounce time
4. Check permissions: Ensure read permissions for source directory

## Advanced Usage

### Custom Output Directory

```bash
npm run sync-rules --ide cursor --output /path/to/custom/dir
```

### Sync Specific Files

```bash
npm run sync-rules --files "architecture.mdc,patterns.mdc" --ide cursor
```

### Verification Before Commit

```bash
# Check what would change
npm run sync-rules --ide cursor --verify

# If changes look good, sync without verify
npm run sync-rules --ide cursor
```

### Backup Before Major Changes

```bash
# Create backups before syncing
npm run sync-rules --ide cursor --backup
```

## Integration with CI/CD

Add to your CI pipeline to ensure rule files are always up to date:

```yaml
# GitHub Actions example
- name: Sync rules
  run: |
    npm install
    npm run build
    npm run sync-rules --ide all
```

## Migration from Database-Based Syncing

If you were previously using database-based syncing:

1. **Export existing rules**: Use `memory_export` tool to export guidelines to files
2. **Organize files**: Place exported files in `rules/rules/` directory
3. **Update scripts**: Remove old database-based options from CI/CD scripts
4. **Test sync**: Run `npm run sync-rules --verify` to check sync works

## See Also

- [Getting Started Guide](./getting-started.md) - Initial setup
- [API Reference](./api-reference.md) - Full API documentation
- [Architecture Guide](./architecture.md) - System architecture




