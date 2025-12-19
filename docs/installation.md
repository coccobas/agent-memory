# Installation

## Prerequisites

- **Node.js** >= 20.0.0 ([download](https://nodejs.org/))
- **npm** >= 9.0.0 (included with Node.js)

### Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| macOS (Intel/Apple Silicon) | ✅ Supported | Primary development platform |
| Linux (x64/arm64) | 🧪 Not tested | Should work, feedback welcome |
| Windows (x64) | 🧪 Not tested | See [Windows setup](guides/windows-setup.md) |

## Installation Methods

### Option 1: npx (No Installation)

Run directly without installing:

```bash
npx agent-memory@latest mcp
```

Best for: Quick testing, one-off usage.

### Option 2: Global Install

```bash
npm install -g agent-memory
agent-memory mcp
```

Best for: Regular usage, running as a service.

### Option 3: Project Dependency

```bash
npm install agent-memory
npx agent-memory mcp
```

Best for: Project-specific configurations, version pinning.

### Option 4: From Source

```bash
git clone https://github.com/anthropics/agent-memory.git
cd agent-memory
npm install
npm run build
node dist/cli.js mcp
```

Best for: Development, customization, contributing.

### Option 5: Docker

```bash
# Pull the image
docker pull ghcr.io/anthropics/agent-memory:latest

# Run
docker run -v ~/.agent-memory:/data ghcr.io/anthropics/agent-memory:latest mcp
```

Or build locally:

```bash
docker build -t agent-memory .
docker run -v ~/.agent-memory:/data agent-memory mcp
```

Best for: Containerized deployments, isolation.

See [Docker setup guide](guides/docker-setup.md) for detailed configuration.

## Verify Installation

```bash
# Check version
agent-memory --version

# Run health check
agent-memory mcp &
# Then use your MCP client to call memory_health
```

## Data Storage

By default, Agent Memory stores data in:

| Installation | Default Path |
|--------------|--------------|
| npm package | `~/.agent-memory/data` |
| From source | `<project>/data` |
| Docker | `/data` (mount a volume) |

Override with:

```bash
AGENT_MEMORY_DATA_DIR=/custom/path agent-memory mcp
```

## Upgrading

### Upgrade via npm

```bash
npm update -g agent-memory
```

### From Source

```bash
git pull
npm install
npm run build
```

### Docker

```bash
docker pull ghcr.io/anthropics/agent-memory:latest
```

## Uninstalling

### Uninstall via npm

```bash
npm uninstall -g agent-memory
```

### Data Cleanup

Data is stored separately from the installation:

```bash
# Remove data (optional - this deletes all memory!)
rm -rf ~/.agent-memory
```

## Troubleshooting

### Node.js Version Error

```
Error: Agent Memory requires Node.js >= 20.0.0
```

**Solution:** Update Node.js using nvm or download from nodejs.org.

```bash
# Using nvm
nvm install 20
nvm use 20
```

### Permission Denied

```
EACCES: permission denied
```

**Solution:** Don't use `sudo` with npm. Fix npm permissions:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### Native Module Build Errors

Agent Memory uses `better-sqlite3` which requires compilation:

**macOS:**
```bash
xcode-select --install
```

**Ubuntu/Debian:**
```bash
sudo apt-get install build-essential python3
```

**Windows:**
```bash
npm install --global windows-build-tools
```

## Next Steps

- [Quickstart](quickstart.md) - Get running in 2 minutes
- [Getting Started](getting-started.md) - Full setup guide
- [Troubleshooting](guides/troubleshooting.md) - More solutions
