# Rules Sync

Agent guidelines for interacting with the MCP server. Rules teach AI assistants how to use Agent Memory — the workflow, tools, and best practices.

## Overview

Rules are markdown files that IDEs load as context. They guide AI assistants on:

- **How to query memory** before exploring files
- **When to store** guidelines, knowledge, and tools
- **Proper tool usage** with correct parameters
- **Best practices** for tagging, scoping, and deduplication

Agent Memory ships with pre-built rule files. The sync process converts these to IDE-specific formats.

```
┌─────────────────────────────────────────────────────────────────┐
│                         RULES FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  rules/                        IDE-specific                     │
│  ├── auto-memory-core.md   →   .claude/CLAUDE.md               │
│  ├── auto-memory-reference.md  .cursor/rules/*.mdc             │
│  ├── auto-memory-examples.md   .vscode/rules/*.md              │
│  └── auto-memory-strategies.md                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Sync to Your IDE

```bash
# Auto-detect IDE and sync
npm run sync-rules

# Sync to specific IDE
npm run sync-rules -- --ide claude
npm run sync-rules -- --ide cursor
npm run sync-rules -- --ide vscode

# Watch mode — auto-sync on changes
npm run sync-rules:watch
```

### Verify Without Changes

```bash
npm run sync-rules -- --verify
```

Shows what would change without writing files.

---

## Supported IDEs

| IDE | Format | Destination | Notes |
|:----|:-------|:------------|:------|
| Claude Code | Single `.md` | `~/.claude/CLAUDE.md` | Concatenates all rules |
| Cursor | `.mdc` files | `.cursor/rules/` | One file per rule |
| VS Code | `.md` files | `.vscode/rules/` | One file per rule |
| Generic | `.md` files | `.ide-rules/` | Fallback format |

---

## Rule Files

### Consumer Rules (Synced)

These are synced to all IDEs:

| File | Purpose |
|:-----|:--------|
| `auto-memory-core.md` | Essential workflow: query → store → tag |
| `auto-memory-reference.md` | Complete reference for all 20+ MCP tools |
| `auto-memory-examples.md` | Real-world usage patterns and triggers |
| `auto-memory-strategies.md` | Optimization and best practices |
| `auto-memory-advanced.md` | Advanced features, conflict resolution |

### Developer Rules (Not Synced)

These are for Agent Memory contributors only:

| File | Purpose |
|:-----|:--------|
| `developer/architecture.md` | Internal architecture |
| `developer/coding-standards.md` | TypeScript conventions |
| `developer/patterns.md` | Design patterns |
| `developer/testing.md` | Testing guidelines |

Developer rules are excluded via `.rulesignore`.

---

## CLI Options

```bash
npm run sync-rules -- [options]
```

| Option | Description | Default |
|:-------|:------------|:--------|
| `--ide <name>` | Target IDE (claude, cursor, vscode) | Auto-detect |
| `--project` | Sync to project directory | User-level |
| `--verify` | Show changes without writing | false |
| `--backup` | Backup existing files before overwrite | false |
| `--verbose` | Show detailed output | false |

### Examples

```bash
# Sync to Claude Code (user-level)
npm run sync-rules -- --ide claude

# Sync to project's .cursor/rules/
npm run sync-rules -- --ide cursor --project

# Preview changes
npm run sync-rules -- --ide cursor --verify

# Backup existing before sync
npm run sync-rules -- --ide cursor --backup
```

---

## IDE-Specific Details

### Claude Code

Claude Code uses a single `CLAUDE.md` file that's loaded automatically.

**User-level sync:**

```bash
npm run sync-rules -- --ide claude
# Writes to: ~/.claude/CLAUDE.md
```

**Project-level sync:**

```bash
npm run sync-rules -- --ide claude --project
# Writes to: .claude/CLAUDE.md
```

Claude Code concatenates all rule files into one, with headers separating sections.

### Cursor

Cursor uses `.mdc` (Markdown Component) files with YAML frontmatter.

**User-level sync:**

```bash
npm run sync-rules -- --ide cursor
# Writes to: ~/.cursor/rules/*.mdc
```

**Project-level sync:**

```bash
npm run sync-rules -- --ide cursor --project
# Writes to: .cursor/rules/*.mdc
```

Each rule file becomes a separate `.mdc` file:

```yaml
---
description: Agent Memory core workflow
globs:
alwaysApply: true
---

# Agent Memory Workflow
...
```

### VS Code

VS Code uses standard markdown files.

```bash
npm run sync-rules -- --ide vscode --project
# Writes to: .vscode/rules/*.md
```

---

## Watch Mode

Auto-sync when rule files change:

```bash
npm run sync-rules:watch
```

This watches the `rules/` directory and re-syncs on any change. Useful during rule development.

---

## Ignore Patterns

The `.rulesignore` file controls which files are excluded from sync:

```
# Exclude developer rules
developer/*

# Exclude temporary files
*.tmp
*.bak

# Exclude README
README.md
```

---

## Customizing Rules

### Adding Project-Specific Rules

Create a `rules/` directory in your project:

```
myproject/
├── rules/
│   └── project-guidelines.md
└── .cursor/
    └── rules/
```

Then sync with `--project`:

```bash
npm run sync-rules -- --ide cursor --project
```

### Editing Existing Rules

1. Fork/clone agent-memory
2. Edit files in `rules/`
3. Run `npm run sync-rules`
4. Test in your IDE

### Rule File Structure

Each rule file should follow this structure:

```markdown
# Rule Name

Brief description of what this rule covers.

## Section 1

Content...

## Section 2

Content...
```

For Cursor (`.mdc`), the sync adds YAML frontmatter automatically.

---

## Troubleshooting

### Rules Not Loading

1. Verify files exist: `ls ~/.claude/CLAUDE.md` or `ls .cursor/rules/`
2. Check file permissions
3. Restart your IDE

### Sync Errors

```bash
# Run with verbose output
npm run sync-rules -- --verbose
```

### Cursor Not Detecting Rules

Cursor requires `.mdc` extension. Verify:

```bash
ls .cursor/rules/*.mdc
```

### Claude Code Ignoring CLAUDE.md

1. Check for syntax errors in the file
2. Verify path: `~/.claude/CLAUDE.md` (user) or `.claude/CLAUDE.md` (project)
3. Restart Claude Code

---

## Integration with Memory

Rules sync complements the hooks system:

| Feature | Purpose |
|:--------|:--------|
| **Rules Sync** | Teach AI how to use memory (documentation) |
| **Hooks** | Enforce guidelines at runtime (enforcement) |

Use both for complete integration:

1. Sync rules so AI knows the workflow
2. Install hooks so AI can't violate critical guidelines

---

## See Also

- [Hooks Guide](hooks.md) — Runtime enforcement via IDE hooks
- [IDE Setup](ide-setup.md) — Complete IDE configuration
- [Examples](examples.md) — Real-world rule examples
