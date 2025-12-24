# First Hook Tutorial

Set up runtime enforcement so your agent follows guidelines automatically.

**What you'll learn:**
- How hooks enforce guidelines at runtime
- How to install and configure hooks
- How to test that enforcement is working

**Prerequisites:**
- Completed [First Workflow](first-workflow.md)
- Using Claude Code (hooks are currently Claude Code only)

**Time:** ~5 minutes

---

## What Are Hooks?

Hooks are scripts that run at key moments in your agent's workflow:

```
User Action          Hook Fires           What Happens
───────────          ──────────           ────────────

Edit file      →     PreToolUse     →     Check guidelines → Block if violation

End session    →     Stop           →     Require review if candidates exist

Send message   →     UserPromptSubmit →   Parse special commands
```

---

## Step 1: Create a Critical Guideline

First, store a guideline that should be enforced:

```json
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-abc123",
  "name": "no-console-log",
  "content": "Never use console.log in production code. Use the logger utility instead.",
  "category": "code_style",
  "priority": 95
}
```

**Tool:** `memory_guideline`

High priority (95) ensures this is treated as critical.

---

## Step 2: Install Hooks

Using the MCP tool:

```json
{
  "action": "install",
  "ide": "claude",
  "projectPath": "/path/to/your/project",
  "projectId": "proj-abc123"
}
```

**Tool:** `memory_hook`

Or via CLI:

```bash
npx agent-memory hook install --ide claude --project-path /path/to/your/project
```

This creates hooks in `.claude/hooks/` in your project.

---

## Step 3: Verify Installation

Check that hooks are installed:

```json
{
  "action": "status",
  "ide": "claude",
  "projectPath": "/path/to/your/project"
}
```

**Tool:** `memory_hook`

You should see:
```json
{
  "installed": true,
  "hooks": ["PreToolUse", "Stop", "UserPromptSubmit"]
}
```

---

## Step 4: Test Enforcement

Now try to violate your guideline. Ask your agent:

```
Add a console.log statement to debug the login function
```

The PreToolUse hook should:
1. Check the proposed code against guidelines
2. Find it violates "no-console-log"
3. Block the action and suggest using the logger instead

---

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                   PreToolUse Hook                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. Agent wants to write code                        │
│     ↓                                                │
│  2. Hook intercepts the action                       │
│     ↓                                                │
│  3. Check against critical guidelines (priority 80+) │
│     ↓                                                │
│  4. Violation found? → Block and explain             │
│     No violation?   → Allow action                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Step 5: Uninstall (If Needed)

To remove hooks:

```bash
npx agent-memory hook uninstall --ide claude --project-path /path/to/your/project
```

---

## Tips

### Which guidelines get enforced?

Only **high-priority guidelines** (80+) are checked by hooks. Lower priority guidelines are available for context but don't block actions.

### Multiple projects?

Install hooks in each project directory. They'll use that project's guidelines.

### Not using Claude Code?

For Cursor or VS Code, use [Rules Sync](../guides/rules-sync.md) instead. It exports guidelines as documentation files that agents can read.

---

## Next Steps

- [Hooks Guide](../guides/hooks.md) - Full hook configuration
- [Rules Sync](../guides/rules-sync.md) - Export guidelines for other IDEs
- [Workflows](../guides/workflows.md) - Common usage patterns
