# Getting Started

This guide walks you through setting up and using Agent Memory.

> **Windows users:** For Windows-specific setup instructions, see the [Windows Setup Guide](./guides/windows-setup.md).

## Prerequisites

- Node.js 20.x or later (or Docker 20.x+ for containerized deployment)
- npm 10.x or later (not needed for Docker)
- An MCP-compatible client (Claude Desktop, Claude Code, etc.)

## Installation

### 1. Clone or Create Project

```bash
# If you have the source
cd agent-memory
npm install
```

### 2. Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### 3. Database Initialization

**The database is automatically initialized on first run** - no manual setup required!

On first startup, the server will:
- Create the database file at `data/memory.db` (relative to the Agent Memory project root)
- Apply all schema migrations automatically
- Track applied migrations in a `_migrations` table

For a stable location across IDEs and installs, set `AGENT_MEMORY_DB_PATH` to an absolute path (for example `~/.agent-memory/memory.db`).

You can verify initialization works:

```bash
# Run the initialization test
npm run build
node dist/test-init.js
```

For manual control, use the `memory_init` MCP tool (see [Initialization Guide](./reference/initialization.md)).

### 4. Verify Installation

```bash
# Run tests
npm test

# Type check
npm run typecheck
```

## Running the Server

### Standalone Mode

```bash
node dist/cli.js mcp
```

The server runs using stdio transport, expecting MCP protocol messages on stdin/stdout.

### With Claude Desktop

**Unix/Linux/macOS:**
Add to your Claude Desktop configuration (`~/.config/claude/claude_desktop_config.json`; some macOS installs use `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/agent-memory/dist/cli.js", "mcp"]
    }
  }
}
```

**Windows:**
Add to your Claude Desktop configuration (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["C:/path/to/agent-memory/dist/cli.js", "mcp"]
    }
  }
}
```

**Note:** On Windows, you can use forward slashes (`/`) or escaped backslashes (`\\`) in paths. Both work with Node.js.

Restart Claude Desktop to load the server.

> **Windows users:** See [Windows Setup Guide](./guides/windows-setup.md) for detailed Windows-specific instructions.

### With Claude Code

Agent Memory can be configured at three different scopes in Claude Code:

#### User-Level (Global)
Available across all projects. Add to `~/.claude.json` (Windows: `%USERPROFILE%\.claude.json`):

**NPM Package (Recommended):**
```json
{
  "mcpServers": {
    "agent-memory": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"],
      "env": {}
    }
  }
}
```

**Docker:**
```json
{
  "mcpServers": {
    "agent-memory": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v",
        "~/.agent-memory:/data",
        "-e",
        "AGENT_MEMORY_DATA_DIR=/data",
        "ghcr.io/coccobas/agent-memory:latest"
      ],
      "env": {}
    }
  }
}
```

**Local Development:**
```json
{
  "mcpServers": {
    "agent-memory": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/agent-memory/dist/cli.js"],
      "env": {}
    }
  }
}
```

#### Project-Level (Shared)
Committed to repository for team collaboration. Create `.mcp.json` in project root:

```json
{
  "mcpServers": {
    "agent-memory": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"],
      "env": {}
    }
  }
}
```

#### Local Project (Private)
Project-specific but not shared. Automatically created in `~/.claude.json` when using CLI:

**Unix/Linux/macOS:**
```bash
claude mcp add agent-memory node /absolute/path/to/agent-memory/dist/cli.js
```

**Windows (PowerShell/CMD):**
```powershell
claude mcp add agent-memory node C:\path\to\agent-memory\dist\cli.js
```

Or with forward slashes:
```powershell
claude mcp add agent-memory node C:/path/to/agent-memory/dist/cli.js
```

### With Docker

For containerized deployment, build and run the Docker image:

```bash
# Build the image
cd agent-memory
docker build -t agent-memory:latest .

# Add to Claude Code
claude mcp add agent-memory docker -- run -i --rm \
  -v ~/.agent-memory:/data \
  agent-memory:latest
```

Data is stored in `~/.agent-memory` on the host. The container uses hardcoded paths internally (`/data/memory.db`, `/data/vectors.lance`), so `AGENT_MEMORY_DB_PATH` and `AGENT_MEMORY_VECTOR_DB_PATH` from `.env` are **not used** in Docker.

> For detailed Docker configuration including docker-compose, environment variables, and troubleshooting, see the [Docker Setup Guide](./guides/docker-setup.md).

## First Steps

Once the server is running, you can interact with it through your MCP client.

### 1. Create an Organization (Optional)

Organizations group projects for team scenarios.

```
Use tool: memory_org
Parameters: {
  "action": "create",
  "name": "My Team"
}
```

### 2. Create a Project

```
Use tool: memory_project
Parameters: {
  "action": "create",
  "name": "my-web-app",
  "description": "React web application",
  "rootPath": "/Users/me/projects/my-web-app"
}
```

Save the returned `project.id` - you'll need it for scoped entries.

### 3. Add Your First Guideline

```
Use tool: memory_guideline
Parameters: {
  "action": "add",
  "scopeType": "project",
  "scopeId": "<your-project-id>",
  "name": "typescript-strict",
  "category": "code_style",
  "priority": 90,
  "content": "All TypeScript files must use strict mode. Enable 'strict: true' in tsconfig.json.",
  "rationale": "Catches more errors at compile time"
}
```

### 4. Query Guidelines

```
Use tool: memory_guideline
Parameters: {
  "action": "list",
  "scopeType": "project",
  "scopeId": "<your-project-id>"
}
```

This returns your project guidelines plus any inherited from parent scopes.

### 5. Add Knowledge

```
Use tool: memory_knowledge
Parameters: {
  "action": "add",
  "scopeType": "project",
  "scopeId": "<your-project-id>",
  "title": "Tech Stack Decision",
  "category": "decision",
  "content": "Using React 18 with TypeScript. State management: Zustand. Styling: Tailwind CSS.",
  "source": "Architecture meeting 2024-12-10"
}
```

### 6. Tag Entries

```
Use tool: memory_tag
Parameters: {
  "action": "attach",
  "entryType": "guideline",
  "entryId": "<guideline-id>",
  "tagName": "typescript"
}
```

## Working with Sessions

<details>
<summary><strong>Show details</strong></summary>

Sessions track temporary working context.

### Start a Session

```
Use tool: memory_session
Parameters: {
  "action": "start",
  "projectId": "<your-project-id>",
  "name": "Feature: User Auth",
  "purpose": "Implementing user authentication flow"
}
```

### Add Session-Scoped Knowledge

```
Use tool: memory_knowledge
Parameters: {
  "action": "add",
  "scopeType": "session",
  "scopeId": "<session-id>",
  "title": "Auth Implementation Notes",
  "category": "context",
  "content": "Using JWT tokens. Refresh token rotation enabled. 15 minute access token expiry."
}
```

### End the Session

```
Use tool: memory_session
Parameters: {
  "action": "end",
  "id": "<session-id>",
  "status": "completed"
}
```

</details>

## Common Workflows

<details>
<summary><strong>Show details</strong></summary>

### Finding Relevant Context

When starting work on a file or feature, query for relevant guidelines:

```
Use tool: memory_guideline
Parameters: {
  "action": "list",
  "scopeType": "project",
  "scopeId": "<project-id>",
  "category": "code_style"
}
```

### Recording Decisions

When you make an architectural or design decision:

```
Use tool: memory_knowledge
Parameters: {
  "action": "add",
  "scopeType": "project",
  "scopeId": "<project-id>",
  "title": "Database Choice",
  "category": "decision",
  "content": "Selected PostgreSQL over MySQL for JSONB support and better concurrent write handling.",
  "source": "Team discussion"
}
```

### Documenting Tools

When you discover or create a useful tool:

```
Use tool: memory_tool
Parameters: {
  "action": "add",
  "scopeType": "project",
  "scopeId": "<project-id>",
  "name": "npm run dev",
  "category": "cli",
  "description": "Start development server with hot reload",
  "parameters": {
    "port": { "type": "number", "default": 3000 }
  }
}
```

### Linking Related Entries

Connect related guidelines and knowledge:

```
Use tool: memory_relation
Parameters: {
  "action": "create",
  "sourceType": "guideline",
  "sourceId": "<guideline-id>",
  "targetType": "knowledge",
  "targetId": "<knowledge-id>",
  "relationType": "related_to"
}
```

---

</details>

## Using Agent Memory Inside an AI Agent

<details>
<summary><strong>Show details</strong></summary>

When integrating an agent (e.g., Claude or a custom MCP client), a typical loop is:

1. **Determine scope** from the current workspace or task (org → project → session).
2. **Fetch guidelines and knowledge** relevant to the file or feature:

```json
{
  "name": "memory_query",
  "arguments": {
    "types": ["guidelines", "knowledge"],
    "scope": { "type": "project", "id": "<project-id>", "inherit": true },
    "search": "authentication",
    "tags": { "include": ["security"] },
    "limit": 20
  }
}
```

3. **Summarize context** for the current session using:

```json
{
  "name": "memory_query",
  "arguments": {
    "action": "context",
    "scopeType": "session",
    "scopeId": "<session-id>",
    "inherit": true,
    "compact": true
  }
}
```

4. **Write back learnings** as the agent discovers new tools or decisions:
   - Use `memory_tool` with `action: "add"` / `action: "update"` for new capabilities.
   - Use `memory_guideline` with `action: "add"` for new rules or patterns.
   - Use `memory_knowledge` with `action: "add"` for important facts and decisions.

</details>

## Scope Hierarchy

<details>
<summary><strong>Show details</strong></summary>

Understanding scope is key to effective use:

```
Global (applies everywhere)
   │
   └── Organization (team-wide)
          │
          └── Project (project-specific)
                 │
                 └── Session (temporary)
```

### Inheritance Rules

- When querying with `inherit: true` (default), results include all parent scopes
- More specific scopes override general ones (session > project > org > global)
- Use `inherit: false` to get only exact scope matches

### Choosing the Right Scope

| Scope | Use For |
|-------|---------|
| Global | Universal best practices, security guidelines |
| Organization | Team standards, shared tooling |
| Project | Project-specific patterns, decisions |
| Session | Temporary context, experimental ideas |

</details>

## Updating Entries

<details>
<summary><strong>Show details</strong></summary>

All updates create new versions:

```
Use tool: memory_guideline
Parameters: {
  "action": "update",
  "id": "<guideline-id>",
  "content": "Updated guideline text...",
  "changeReason": "Clarified edge case handling"
}
```

View history:

```
Use tool: memory_guideline
Parameters: {
  "action": "history",
  "id": "<guideline-id>"
}
```

</details>

## Best Practices

<details>
<summary><strong>Show details</strong></summary>

### 1. Use Meaningful Names

Entry names should be descriptive and searchable:
- Good: `typescript-strict-mode`, `error-handling-async`
- Bad: `rule1`, `guideline-new`

### 2. Provide Rationale

Always explain *why* a guideline exists:

```json
{
  "content": "Use async/await instead of .then() chains",
  "rationale": "Improves readability and makes error handling with try/catch cleaner"
}
```

### 3. Use Categories Consistently

Stick to a defined set of categories:
- Guidelines: `code_style`, `behavior`, `security`, `performance`, `error_handling`
- Knowledge: `decision`, `fact`, `context`, `reference`
- Tools: `mcp`, `cli`, `function`, `api`

### 4. Tag Liberally

Tags enable cross-cutting queries:

```
Use tool: memory_tag
Parameters: {
  "action": "attach",
  "entryType": "guideline",
  "entryId": "<id>",
  "tagName": "python"
}
```

### 5. Record Decisions Immediately

Don't wait - capture decisions when they're made:

```
Use tool: memory_knowledge
Parameters: {
  "action": "add",
  "scopeType": "project",
  "scopeId": "<id>",
  "title": "API Versioning Strategy",
  "category": "decision",
  "content": "Using URL path versioning (/v1/, /v2/) rather than headers.",
  "source": "RFC discussion"
}
```

</details>

## Semantic Search (Optional)

<details>
<summary><strong>Show details</strong></summary>

Agent Memory supports semantic/vector search for finding conceptually similar entries, not just exact text matches.

### Enabling Semantic Search

Semantic search works with two providers:

#### Option 1: OpenAI (Recommended)

```bash
# Set environment variables
export AGENT_MEMORY_EMBEDDING_PROVIDER=openai
export AGENT_MEMORY_OPENAI_API_KEY=your-api-key

# Optional: specify model (default: text-embedding-3-small)
export AGENT_MEMORY_OPENAI_MODEL=text-embedding-3-small
```

#### Option 2: Local Model (No API Key Required)

```bash
# Use local embeddings (slower, but free)
export AGENT_MEMORY_EMBEDDING_PROVIDER=local
```

The first run will download the model (~90MB).

#### Disable Semantic Search

```bash
export AGENT_MEMORY_EMBEDDING_PROVIDER=disabled
```

### Backfilling Embeddings

After enabling semantic search, generate embeddings for existing entries:

```typescript
// Via MCP tool or programmatically
import { backfillEmbeddings } from './src/services/backfill.service.js';

await backfillEmbeddings({
  batchSize: 50,
  delayMs: 1000, // Respect rate limits
  onProgress: (progress) => {
    console.log(`${progress.processed}/${progress.total} processed`);
  }
});
```

### Using Semantic Search

Once configured, semantic search is enabled by default:

```json
{
  "action": "search",
  "search": "user authentication",
  "semanticSearch": true,
  "semanticThreshold": 0.7
}
```

This will find entries about "login", "credentials", "auth tokens" even if they don't contain the exact words "user authentication".

### Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_EMBEDDING_PROVIDER` | `auto` | `openai`, `local`, or `disabled` (unset = auto) |
| `AGENT_MEMORY_OPENAI_API_KEY` | - | Required for OpenAI provider |
| `AGENT_MEMORY_OPENAI_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `AGENT_MEMORY_VECTOR_DB_PATH` | `data/vectors.lance` | Vector database location |
| `AGENT_MEMORY_SEMANTIC_THRESHOLD` | `0.7` | Minimum similarity score (0-1) |

---

</details>

## Using Conversation History

<details>
<summary><strong>Show details</strong></summary>

Conversation history tracks multi-turn interactions between agents and users, linking them to memory entries for learning and context continuity.

### Quick Start

```json
// 1. Start a conversation
{
  "action": "start",
  "projectId": "proj_123",
  "title": "Authentication Discussion",
  "agentId": "agent-1"
}

// 2. Add messages
{
  "action": "add_message",
  "conversationId": "conv_abc123",
  "role": "user",
  "content": "What guidelines apply to authentication?"
}

// 3. Query with auto-linking
{
  "action": "query",
  "search": "authentication",
  "conversationId": "conv_abc123",
  "types": ["guidelines"]
}

// 4. Add agent response with context
{
  "action": "add_message",
  "conversationId": "conv_abc123",
  "role": "agent",
  "content": "Based on the guidelines...",
  "contextEntries": [
    { "type": "guideline", "id": "guideline_123" }
  ],
  "toolsUsed": ["memory_query"]
}

// 5. End conversation
{
  "action": "end",
  "id": "conv_abc123",
  "generateSummary": true
}
```

### Common Patterns

#### Pattern 1: Track Query Context

Automatically link memory entries used in queries:

```json
{
  "action": "query",
  "search": "security",
  "conversationId": "conv_123",
  "autoLinkContext": true
}
```

This creates context links for all query results, enabling:
- "What conversations used this guideline?"
- "Which memory entries are most useful?"

#### Pattern 2: Message-Level Context

Link entries to specific messages:

```json
{
  "action": "add_message",
  "conversationId": "conv_123",
  "role": "agent",
  "content": "Response",
  "contextEntries": [
    { "type": "knowledge", "id": "knowledge_456" }
  ]
}
```

#### Pattern 3: Search Past Conversations

Find conversations about specific topics:

```json
{
  "action": "search",
  "search": "authentication",
  "projectId": "proj_123"
}
```

### Best Practices

1. **Start conversations at project or session scope** - Enables proper scoping and filtering
2. **Use auto-linking in queries** - Automatically tracks which entries are used
3. **Include context in agent messages** - Document which memory entries informed the response
4. **End conversations when complete** - Enables proper status tracking and archiving
5. **Generate summaries for long conversations** - Helps with review and knowledge extraction

### Integration Examples

#### With Query Handler

```typescript
// Query automatically links results to conversation
const queryResult = await memory_query({
  search: "authentication",
  conversationId: conversation.id,
  messageId: currentMessage.id,
  types: ["guidelines", "knowledge"]
});

// Results are automatically linked via conversation_context table
```

#### With Analytics

```typescript
// Get analytics for a conversation
const analytics = getConversationAnalytics(conversationId);
// Returns: message counts, duration, most used entries, tools used
```

#### Knowledge Extraction

```typescript
// Extract knowledge from completed conversations
const knowledgeEntries = extractKnowledgeFromConversation(conversationId);
// Returns: Array of knowledge entries to create from conversation
```

---

</details>

## Syncing Rules to IDEs

<details>
<summary><strong>Show details</strong></summary>

Agent Memory can automatically sync guidelines to IDE-specific rule formats, making it easy to set up rules in any IDE.

### Quick Sync

```bash
# Auto-detect your IDE and sync rules
npm run sync-rules --auto-detect

# Sync to specific IDE
npm run sync-rules --ide cursor --scope project --scope-id <project-id>
```

### Supported IDEs

- **Cursor** - `.cursor/rules/*.mdc` files
- **VS Code** - `.vscode/rules/*.md` files  
- **IntelliJ/IDEA** - `.idea/codeStyles/` XML files
- **Sublime Text** - `.sublime-project` JSON
- **Neovim** - `.nvim/agent-memory-rules.lua`
- **Emacs** - `.emacs.d/agent-memory-rules.el`
- **Antigravity** - `.agent/rules/*.md` files
- **Generic** - `.ide-rules/*.md` (works with any IDE)

### Watch Mode

Keep rules in sync automatically:

```bash
npm run sync-rules:watch
```

### Git Integration

Install pre-commit hook to auto-sync before commits:

**Unix/Linux/macOS:**
```bash
ln -s ../../scripts/pre-commit-sync.sh .git/hooks/pre-commit
```

**Windows (Git Bash):**
```bash
ln -s ../../scripts/pre-commit-sync.sh .git/hooks/pre-commit
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType SymbolicLink -Path .git\hooks\pre-commit -Target ..\..\scripts\pre-commit-sync.sh
```

**Note:** On Windows, shell scripts require Git Bash or WSL. Alternatively, use the TypeScript scripts (`npm run sync-rules`) which work on all platforms.

For detailed documentation, see [Rules Sync Guide](./guides/rules-sync.md).

---

</details>

## Troubleshooting

<details>
<summary><strong>Show details</strong></summary>

> **Windows users:** See [Windows Setup Guide - Troubleshooting](./guides/windows-setup.md#troubleshooting) for Windows-specific troubleshooting tips.

### Server Won't Start

1. Check Node.js version: `node --version` (need 20.x+)
2. Verify build: `npm run build`
3. Check for TypeScript errors: `npm run typecheck`

### Database Errors

1. Ensure `data/` directory exists and is writable
2. Check initialization status with `memory_init` tool: `{"action": "status"}`
3. Reset database if needed: Delete `data/memory.db` (server will auto-reinitialize)
4. See [Initialization Guide](./reference/initialization.md) for advanced troubleshooting

### MCP Connection Issues

1. Verify server path in configuration is absolute
2. Check Claude Desktop/Code logs for connection errors
3. Try running server standalone to verify it starts

### Missing Entries

1. Check scope: entries are scoped and may not appear in wrong context
2. Verify `inherit: true` to include parent scopes
3. Check `includeInactive` if entry was deactivated

</details>
