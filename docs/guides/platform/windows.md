# Windows Setup Guide

Complete guide for running Agent Memory on Windows.

## Prerequisites

- **Node.js 18+**: Download from [nodejs.org](https://nodejs.org/)
- **npm**: Included with Node.js
- **PowerShell 5.1+** or **Command Prompt**

Verify installation:

```powershell
node --version
npm --version
```

---

## Installation

### Global Install (Recommended)

```powershell
npm install -g agent-memory
```

Verify:

```powershell
agent-memory --version
```

### Local Install

For project-specific installations:

```powershell
npm install agent-memory
npx agent-memory --version
```

---

## Running the Server

### MCP Server (Default)

```powershell
agent-memory mcp
```

### REST Server

```powershell
$env:AGENT_MEMORY_REST_ENABLED = "true"
$env:AGENT_MEMORY_REST_API_KEY = "your-secret-key"
agent-memory rest
```

### Both Servers

```powershell
$env:AGENT_MEMORY_REST_ENABLED = "true"
$env:AGENT_MEMORY_REST_API_KEY = "your-secret-key"
agent-memory both
```

---

## Environment Variables

### Setting Variables in PowerShell

**Session-only (temporary):**

```powershell
$env:AGENT_MEMORY_DATA_DIR = "C:\data\agent-memory"
$env:AGENT_MEMORY_OPENAI_API_KEY = "sk-..."
```

**Persistent (user-level):**

```powershell
[System.Environment]::SetEnvironmentVariable("AGENT_MEMORY_DATA_DIR", "C:\data\agent-memory", "User")
[System.Environment]::SetEnvironmentVariable("AGENT_MEMORY_OPENAI_API_KEY", "sk-...", "User")
```

**System-wide (requires admin):**

```powershell
# Run as Administrator
[System.Environment]::SetEnvironmentVariable("AGENT_MEMORY_DATA_DIR", "C:\data\agent-memory", "Machine")
```

### Using .env Files

Create a `.env` file in your working directory:

```ini
AGENT_MEMORY_DATA_DIR=C:\data\agent-memory
AGENT_MEMORY_OPENAI_API_KEY=sk-...
AGENT_MEMORY_REST_ENABLED=true
AGENT_MEMORY_REST_API_KEY=your-secret
```

---

## IDE Configuration

### Claude Desktop

Config location:

```
%APPDATA%\Claude\claude_desktop_config.json
```

**Using global install:**

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "agent-memory",
      "args": ["mcp"]
    }
  }
}
```

**Using npm path explicitly:**

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": [
        "C:\\Users\\YourName\\AppData\\Roaming\\npm\\node_modules\\agent-memory\\dist\\cli.js",
        "mcp"
      ]
    }
  }
}
```

**With environment variables:**

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "agent-memory",
      "args": ["mcp"],
      "env": {
        "AGENT_MEMORY_DATA_DIR": "C:\\data\\agent-memory",
        "AGENT_MEMORY_OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

### Cursor

Config location:

```
%APPDATA%\Cursor\User\globalStorage\cursor.mcp\config.json
```

Example configuration:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "agent-memory",
      "args": ["mcp"]
    }
  }
}
```

---

## Path Considerations

### Use Forward Slashes or Escaped Backslashes

In JSON configs, use either:

```json
"C:/data/agent-memory"
```

or:

```json
"C:\\data\\agent-memory"
```

### Recommended Data Directory

```powershell
$env:AGENT_MEMORY_DATA_DIR = "C:\ProgramData\agent-memory"
```

Or per-user:

```powershell
$env:AGENT_MEMORY_DATA_DIR = "$env:LOCALAPPDATA\agent-memory"
```

---

## Common Issues

### "command not found" Error

**Cause:** npm global bin directory not in PATH.

**Fix:**

```powershell
# Find npm bin directory
npm config get prefix

# Add to PATH (replace with actual path)
$env:PATH += ";C:\Users\YourName\AppData\Roaming\npm"
```

### Permission Denied

**Cause:** Running from restricted directory.

**Fix:** Use a data directory with write permissions:

```powershell
$env:AGENT_MEMORY_DATA_DIR = "$env:LOCALAPPDATA\agent-memory"
```

### Long Path Issues

Windows has a 260-character path limit by default.

**Fix:** Enable long paths in Windows 10/11:

```powershell
# Run as Administrator
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

### Database Lock Errors

**Cause:** Multiple processes accessing the database.

**Fix:** Increase busy timeout:

```powershell
$env:AGENT_MEMORY_DB_BUSY_TIMEOUT_MS = "30000"
```

---

## Windows Service (Optional)

To run Agent Memory as a Windows Service:

### Using NSSM

1. Download [NSSM](https://nssm.cc/)

2. Install service:

```powershell
nssm install AgentMemory "C:\Program Files\nodejs\node.exe" "C:\Users\YourName\AppData\Roaming\npm\node_modules\agent-memory\dist\cli.js" "mcp"
```

3. Configure environment:

```powershell
nssm set AgentMemory AppEnvironmentExtra "AGENT_MEMORY_DATA_DIR=C:\ProgramData\agent-memory"
```

4. Start service:

```powershell
nssm start AgentMemory
```

---

## See Also

- [IDE Setup](../ide-setup.md) - Detailed IDE configuration
- [Troubleshooting](../troubleshooting.md) - Common issues
