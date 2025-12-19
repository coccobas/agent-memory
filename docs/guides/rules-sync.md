# Rules Sync

Agent Memory can sync guidelines to IDE-specific formats.

## Commands

```bash
npm run sync-rules
```

```bash
npm run sync-rules -- --ide cursor --scope project --scope-id <project-id>
```

```bash
npm run sync-rules:watch
```

## Notes

- Use `--auto-detect` to detect the IDE automatically.
- Scope controls which guidelines are exported.
