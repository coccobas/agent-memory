# Agent Memory Rules

This directory contains rules that are synced to IDE-specific destinations.

## Directory Structure

```
rules/
├── auto-memory-*.md      # Consumer rules - synced to all projects
├── README.md             # This file - not synced
└── developer/            # Developer rules - not synced by default
    ├── architecture.md
    ├── coding-standards.md
    ├── patterns.md
    └── testing.md
```

## Consumer Rules (Synced)

These files are synced to IDE destinations and are relevant for **any project using Agent Memory**:

| File                        | Purpose                                             |
| --------------------------- | --------------------------------------------------- |
| `auto-memory-core.md`       | Essential Agent Memory workflow                     |
| `auto-memory-advanced.md`   | Advanced features, conflict resolution, maintenance |
| `auto-memory-examples.md`   | Practical usage examples and triggers               |
| `auto-memory-reference.md`  | Complete reference for all 20 MCP tools             |
| `auto-memory-strategies.md` | Optimization strategies                             |

## Developer Rules (Not Synced)

These files in `developer/` are only relevant when **working on the Agent Memory project itself**:

| File                            | Purpose                                      |
| ------------------------------- | -------------------------------------------- |
| `developer/architecture.md`     | Agent Memory internal architecture           |
| `developer/coding-standards.md` | TypeScript config, naming, project structure |
| `developer/patterns.md`         | Design patterns and conventions              |
| `developer/testing.md`          | Testing guidelines and patterns              |

These are excluded from sync via `.rulesignore` but are still loaded into `CLAUDE.md` for AI context when working on this project.

## Sync Destinations

When you run `npm run sync-rules`, consumer rules are synced to:

| IDE     | Destination      | Format                         |
| ------- | ---------------- | ------------------------------ |
| Cursor  | `.cursor/rules/` | `.mdc` (with YAML frontmatter) |
| VS Code | `.vscode/rules/` | `.md`                          |
| Others  | Various          | `.md`                          |

## Commands

```bash
# Sync rules to auto-detected IDE
npm run sync-rules

# Sync to specific IDE
npm run sync-rules -- --ide cursor

# Watch for changes and auto-sync
npm run sync-rules:watch

# Verify without making changes
npm run sync-rules -- --verify
```

## Updating Rules

1. Edit files in this directory
2. Consumer rules (`auto-memory-*.md`) - changes sync to all projects
3. Developer rules (`developer/*.md`) - changes only affect this project's CLAUDE.md
