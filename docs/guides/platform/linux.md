# Linux Setup Guide

Complete guide for running Agent Memory on Linux.

## Prerequisites

- **Node.js 18+**: Install via package manager or nvm
- **npm**: Included with Node.js
- **SQLite3**: Usually pre-installed, or install via package manager

### Ubuntu/Debian

```bash
# Install Node.js 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install SQLite (if not present)
sudo apt-get install -y sqlite3
```

### Fedora/RHEL

```bash
sudo dnf install nodejs npm sqlite
```

### Arch Linux

```bash
sudo pacman -S nodejs npm sqlite
```

### Using nvm (Recommended)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

Verify installation:

```bash
node --version
npm --version
```

---

## Installation

### Global Install (Recommended)

```bash
npm install -g agent-memory
```

Verify:

```bash
agent-memory --version
```

### Local Install

For project-specific installations:

```bash
npm install agent-memory
npx agent-memory --version
```

### Without sudo (Recommended)

Configure npm to use a user directory:

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g agent-memory
```

---

## Running the Server

### MCP Server (Default)

```bash
agent-memory mcp
```

### REST Server

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret-key \
agent-memory rest
```

### Both Servers

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret-key \
agent-memory both
```

---

## Environment Variables

### Session Variables

```bash
export AGENT_MEMORY_DATA_DIR=~/.agent-memory
export AGENT_MEMORY_OPENAI_API_KEY=sk-...
```

### Persistent Variables

Add to `~/.bashrc` or `~/.zshrc`:

```bash
echo 'export AGENT_MEMORY_DATA_DIR=~/.agent-memory' >> ~/.bashrc
echo 'export AGENT_MEMORY_OPENAI_API_KEY=sk-...' >> ~/.bashrc
source ~/.bashrc
```

### Using .env Files

Create `.env` in your working directory:

```ini
AGENT_MEMORY_DATA_DIR=~/.agent-memory
AGENT_MEMORY_OPENAI_API_KEY=sk-...
AGENT_MEMORY_REST_ENABLED=true
AGENT_MEMORY_REST_API_KEY=your-secret
```

### Using direnv (Recommended)

Install direnv for automatic environment loading:

```bash
# Ubuntu/Debian
sudo apt-get install direnv
echo 'eval "$(direnv hook bash)"' >> ~/.bashrc

# Create .envrc in project directory
echo 'export AGENT_MEMORY_DATA_DIR=~/.agent-memory' > .envrc
direnv allow
```

---

## IDE Configuration

### Claude Desktop (Flatpak/Snap)

Config location varies by installation method:

**Flatpak:**
```
~/.var/app/com.anthropic.claude-desktop/config/Claude/claude_desktop_config.json
```

**Snap:**
```
~/snap/claude-desktop/current/.config/Claude/claude_desktop_config.json
```

**Standard:**
```
~/.config/Claude/claude_desktop_config.json
```

**Example configuration:**

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "agent-memory",
      "args": ["mcp"],
      "env": {
        "AGENT_MEMORY_DATA_DIR": "/home/user/.agent-memory"
      }
    }
  }
}
```

### Cursor

Config location:

```
~/.config/Cursor/User/globalStorage/cursor.mcp/config.json
```

---

## Systemd Service

Run Agent Memory as a background service:

### Create Service File

```bash
sudo nano /etc/systemd/system/agent-memory.service
```

```ini
[Unit]
Description=Agent Memory Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username
Environment="AGENT_MEMORY_DATA_DIR=/var/lib/agent-memory"
Environment="AGENT_MEMORY_REST_ENABLED=true"
Environment="AGENT_MEMORY_REST_API_KEY=your-secret-key"
ExecStart=/usr/bin/agent-memory both
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Enable and Start

```bash
# Create data directory
sudo mkdir -p /var/lib/agent-memory
sudo chown your-username:your-username /var/lib/agent-memory

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable agent-memory
sudo systemctl start agent-memory

# Check status
sudo systemctl status agent-memory

# View logs
journalctl -u agent-memory -f
```

---

## User Service (Non-root)

For user-level service without sudo:

```bash
mkdir -p ~/.config/systemd/user
nano ~/.config/systemd/user/agent-memory.service
```

```ini
[Unit]
Description=Agent Memory Server

[Service]
Type=simple
Environment="AGENT_MEMORY_DATA_DIR=%h/.agent-memory"
Environment="AGENT_MEMORY_REST_ENABLED=true"
Environment="AGENT_MEMORY_REST_API_KEY=your-secret-key"
ExecStart=%h/.npm-global/bin/agent-memory both
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable agent-memory
systemctl --user start agent-memory
```

---

## File Permissions

### Data Directory

```bash
mkdir -p ~/.agent-memory
chmod 700 ~/.agent-memory
```

### Database File

```bash
chmod 600 ~/.agent-memory/memory.db
```

### For Shared Access

If multiple users need access:

```bash
sudo mkdir -p /var/lib/agent-memory
sudo chgrp agent-memory /var/lib/agent-memory
sudo chmod 770 /var/lib/agent-memory
```

---

## Docker on Linux

### Direct Docker

```bash
docker run --rm -i \
  -v ~/.agent-memory:/data \
  ghcr.io/anthropics/agent-memory:latest mcp
```

### With User Mapping

Avoid permission issues:

```bash
docker run --rm -i \
  --user $(id -u):$(id -g) \
  -v ~/.agent-memory:/data \
  ghcr.io/anthropics/agent-memory:latest mcp
```

### Rootless Docker

For rootless Docker installations, use standard paths:

```bash
docker run --rm -i \
  -v $HOME/.agent-memory:/data \
  ghcr.io/anthropics/agent-memory:latest mcp
```

---

## SELinux (RHEL/Fedora)

If SELinux is enabled:

```bash
# Allow container to access data directory
sudo chcon -Rt svirt_sandbox_file_t ~/.agent-memory

# Or use :Z flag in volume mount
docker run --rm -i \
  -v ~/.agent-memory:/data:Z \
  ghcr.io/anthropics/agent-memory:latest mcp
```

---

## Common Issues

### Permission Denied

**Cause:** Data directory not writable.

**Fix:**

```bash
mkdir -p ~/.agent-memory
chmod 700 ~/.agent-memory
```

### Command Not Found

**Cause:** npm bin not in PATH.

**Fix:**

```bash
export PATH=$(npm config get prefix)/bin:$PATH
```

### Database Locked

**Cause:** Multiple processes accessing database.

**Fix:**

```bash
export AGENT_MEMORY_DB_BUSY_TIMEOUT_MS=30000
```

### Low Memory (Raspberry Pi)

**Fix:** Reduce cache size:

```bash
export AGENT_MEMORY_CACHE_LIMIT_MB=128
export AGENT_MEMORY_QUERY_CACHE_MEMORY_MB=50
```

---

## See Also

- [IDE Setup](../ide-setup.md) - Detailed IDE configuration
- [Docker Setup](../docker.md) - Container deployment
- [Troubleshooting](../troubleshooting.md) - Common issues
