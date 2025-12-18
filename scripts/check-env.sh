#!/bin/bash

# Agent Memory - Environment Checker
# Validates the development environment and configuration

echo "🔍 Agent Memory - Environment Check"
echo "===================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Function to print status
print_status() {
    if [ "$1" == "ok" ]; then
        echo -e "${GREEN}✅${NC} $2"
    elif [ "$1" == "warn" ]; then
        echo -e "${YELLOW}⚠️${NC}  $2"
        ((WARNINGS++))
    else
        echo -e "${RED}❌${NC} $2"
        ((ERRORS++))
    fi
}

# Check Node.js
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 20 ]; then
        print_status "ok" "Node.js $(node -v)"
    else
        print_status "error" "Node.js version must be >= 20.0.0 (found: $(node -v))"
    fi
else
    print_status "error" "Node.js not found"
fi

# Check npm
echo "Checking npm..."
if command -v npm &> /dev/null; then
    print_status "ok" "npm $(npm -v)"
else
    print_status "error" "npm not found"
fi

# Check if node_modules exists
echo ""
echo "Checking dependencies..."
if [ -d "node_modules" ]; then
    print_status "ok" "node_modules directory exists"
    
    # Check if key dependencies are installed
    if [ -d "node_modules/@modelcontextprotocol" ]; then
        print_status "ok" "@modelcontextprotocol/sdk installed"
    else
        print_status "error" "@modelcontextprotocol/sdk not found - run 'npm install'"
    fi
    
    if [ -d "node_modules/better-sqlite3" ]; then
        print_status "ok" "better-sqlite3 installed"
    else
        print_status "error" "better-sqlite3 not found - run 'npm install'"
    fi
    
    if [ -d "node_modules/drizzle-orm" ]; then
        print_status "ok" "drizzle-orm installed"
    else
        print_status "error" "drizzle-orm not found - run 'npm install'"
    fi
else
    print_status "error" "node_modules not found - run 'npm install'"
fi

# Check if dist exists
echo ""
echo "Checking build..."
	if [ -d "dist" ]; then
	    print_status "ok" "dist directory exists"
	    
	    if [ -f "dist/cli.js" ] || [ -f "dist/index.js" ]; then
	        print_status "ok" "Project is built"
	    else
	        print_status "warn" "dist/cli.js not found - run 'npm run build'"
	    fi
	else
	    print_status "warn" "Project not built - run 'npm run build'"
	fi

# Check database
echo ""
echo "Checking database..."
if [ -d "data" ]; then
    print_status "ok" "data directory exists"
    
    if [ -f "data/memory.db" ]; then
        DB_SIZE=$(du -h "data/memory.db" | cut -f1)
        print_status "ok" "Database exists (size: $DB_SIZE)"
    else
        print_status "warn" "Database not initialized (will auto-initialize on first run)"
    fi
else
    print_status "warn" "data directory not found (will be created automatically)"
fi

# Check environment variables
echo ""
echo "Checking environment variables..."
if [ -n "$AGENT_MEMORY_DB_PATH" ]; then
    print_status "ok" "AGENT_MEMORY_DB_PATH set to: $AGENT_MEMORY_DB_PATH"
else
    print_status "ok" "AGENT_MEMORY_DB_PATH not set (using default: data/memory.db)"
fi

if [ -n "$AGENT_MEMORY_PERF" ] && [ "$AGENT_MEMORY_PERF" == "1" ]; then
    print_status "ok" "Performance logging enabled"
else
    print_status "ok" "Performance logging disabled (set AGENT_MEMORY_PERF=1 to enable)"
fi

if [ -n "$AGENT_MEMORY_CACHE" ] && [ "$AGENT_MEMORY_CACHE" == "0" ]; then
    print_status "warn" "Query caching disabled"
else
    print_status "ok" "Query caching enabled (default)"
fi

# Check config files
echo ""
echo "Checking configuration files..."
if [ -f "package.json" ]; then
    print_status "ok" "package.json exists"
else
    print_status "error" "package.json not found"
fi

if [ -f "tsconfig.json" ]; then
    print_status "ok" "tsconfig.json exists"
else
    print_status "error" "tsconfig.json not found"
fi

if [ -f ".eslintrc.json" ]; then
    print_status "ok" ".eslintrc.json exists"
else
    print_status "warn" ".eslintrc.json not found"
fi

if [ -f ".prettierrc" ]; then
    print_status "ok" ".prettierrc exists"
else
    print_status "warn" ".prettierrc not found"
fi

# Check Git
echo ""
echo "Checking Git..."
if command -v git &> /dev/null; then
    print_status "ok" "Git $(git --version | cut -d' ' -f3)"
    
    if [ -d ".git" ]; then
        print_status "ok" "Git repository initialized"
        
        # Check for uncommitted changes
        if [ -n "$(git status --porcelain)" ]; then
            print_status "warn" "Uncommitted changes in working directory"
        else
            print_status "ok" "Working directory clean"
        fi
    else
        print_status "warn" "Not a Git repository"
    fi
else
    print_status "warn" "Git not found"
fi

# Check for common issues
echo ""
echo "Checking for common issues..."

# Check for zombie processes
ZOMBIE_PROCS=$(ps aux | grep -v grep | grep -c "agent-memory" || true)
if [ "$ZOMBIE_PROCS" -gt 0 ]; then
    print_status "warn" "Found $ZOMBIE_PROCS agent-memory process(es) running"
    echo "          Run: pkill -f agent-memory"
else
    print_status "ok" "No zombie processes"
fi

# Check for lock files
if [ -f "data/memory.db-shm" ] || [ -f "data/memory.db-wal" ]; then
    print_status "warn" "Database lock files present (may indicate active connection)"
else
    print_status "ok" "No database lock files"
fi

# Summary
echo ""
echo "===================================="
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✨ Environment check passed!${NC}"
    echo ""
    echo "You're ready to develop! Try:"
    echo "  npm run dev"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Environment check completed with $WARNINGS warning(s)${NC}"
    echo ""
    echo "Your environment is mostly ready, but check the warnings above."
    exit 0
else
    echo -e "${RED}❌ Environment check failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo ""
    echo "Please fix the errors above before proceeding."
    echo "Run './scripts/dev-setup.sh' to set up the environment."
    exit 1
fi
