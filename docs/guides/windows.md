# Windows Setup

## Install

```powershell
npm install -g agent-memory
```

## Run MCP Server

```powershell
agent-memory mcp
```

## Configure Claude Desktop

Config path:

```
%APPDATA%\Claude\claude_desktop_config.json
```

Example:

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

## Paths

Use `AGENT_MEMORY_DATA_DIR` with a Windows-friendly path:

```powershell
$env:AGENT_MEMORY_DATA_DIR = "C:\data\agent-memory"
```
