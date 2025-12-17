#!/bin/bash
#
# Manual MCP Server Test Script
# Tests both npm and Docker versions of agent-memory
#
# Usage:
#   ./scripts/test-mcp-manual.sh [npm|docker|both]
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DATA_DIR="${AGENT_MEMORY_DATA_DIR:-$HOME/.agent-memory}"
TEST_DATA_DIR="/tmp/agent-memory-test-$$"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test mode (npm, docker, or both)
TEST_MODE="${1:-both}"

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
}

log_section() {
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW} $1${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
}

# Send JSON-RPC request and get response
send_request() {
    local request="$1"
    local runner="$2"

    if [ "$runner" = "npm" ]; then
        echo "$request" | AGENT_MEMORY_DATA_DIR="$TEST_DATA_DIR" node "$PROJECT_DIR/dist/cli.js" 2>/dev/null | head -1
    else
        echo "$request" | docker run --rm -i \
            -v "$TEST_DATA_DIR:/data" \
            -e AGENT_MEMORY_DATA_DIR=/data \
            coccobas/agent-memory:latest 2>/dev/null | head -1
    fi
}

# Check if response contains expected value
check_response() {
    local response="$1"
    local expected="$2"
    local test_name="$3"

    if echo "$response" | grep -q "$expected"; then
        log_success "$test_name"
        return 0
    else
        log_fail "$test_name"
        echo "  Expected: $expected"
        echo "  Got: $response"
        return 1
    fi
}

# Check if file exists
check_file_exists() {
    local filepath="$1"
    local test_name="$2"

    if [ -e "$filepath" ]; then
        log_success "$test_name"
        return 0
    else
        log_fail "$test_name"
        echo "  File not found: $filepath"
        return 1
    fi
}

# =============================================================================
# TEST FUNCTIONS
# =============================================================================

test_initialization() {
    local runner="$1"
    log_section "Testing Initialization ($runner)"

    local request='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
    local response=$(send_request "$request" "$runner")

    check_response "$response" '"protocolVersion"' "Server responds to initialize"
    check_response "$response" '"result"' "Response contains result"
}

test_health_check() {
    local runner="$1"
    log_section "Testing Health Check ($runner)"

    # First initialize
    local init_request='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
    send_request "$init_request" "$runner" > /dev/null

    local request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_health","arguments":{}},"id":2}'
    local response=$(send_request "$request" "$runner")

    # Note: Response contains escaped JSON inside content[0].text
    check_response "$response" 'serverVersion' "Health returns serverVersion"
    check_response "$response" 'status.*healthy' "Status is healthy"
    check_response "$response" 'database' "Health returns database info"
    check_response "$response" 'tables' "Health returns table counts"
}

test_data_dir_resolution() {
    local runner="$1"
    log_section "Testing DATA_DIR Path Resolution ($runner)"

    # Initialize to create database
    local init_request='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
    send_request "$init_request" "$runner" > /dev/null

    # Check files were created in correct location
    if [ "$runner" = "npm" ]; then
        check_file_exists "$TEST_DATA_DIR/memory.db" "Database created in DATA_DIR"
    else
        check_file_exists "$TEST_DATA_DIR/memory.db" "Database created in mounted volume"
    fi
}

test_project_crud() {
    local runner="$1"
    log_section "Testing Project CRUD ($runner)"

    # Initialize
    local init_request='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
    send_request "$init_request" "$runner" > /dev/null

    # Create project
    local create_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_project","arguments":{"action":"create","name":"test-project-'$RANDOM'"}},"id":3}'
    local response=$(send_request "$create_request" "$runner")

    check_response "$response" 'success.*true' "Project created successfully"
    check_response "$response" '"id"' "Project has ID"

    # Extract project ID (handles both escaped and unescaped JSON)
    local project_id=$(echo "$response" | grep -oE '\\?"id\\?"[[:space:]]*:[[:space:]]*\\?"[a-f0-9-]+\\?"' | head -1 | grep -oE '[a-f0-9-]{36}')

    if [ -n "$project_id" ]; then
        log_success "Project ID extracted: $project_id"

        # List projects
        local list_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_project","arguments":{"action":"list"}},"id":4}'
        response=$(send_request "$list_request" "$runner")
        check_response "$response" 'projects' "Project list returns projects array"
    else
        log_fail "Could not extract project ID"
    fi
}

test_guideline_crud() {
    local runner="$1"
    log_section "Testing Guideline CRUD ($runner)"

    # Initialize and create project
    local init_request='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
    send_request "$init_request" "$runner" > /dev/null

    local create_project='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_project","arguments":{"action":"create","name":"guideline-test-'$RANDOM'"}},"id":2}'
    local proj_response=$(send_request "$create_project" "$runner")
    local project_id=$(echo "$proj_response" | grep -oE '\\?"id\\?"[[:space:]]*:[[:space:]]*\\?"[a-f0-9-]+\\?"' | head -1 | grep -oE '[a-f0-9-]{36}')

    if [ -z "$project_id" ]; then
        log_skip "Guideline tests (no project ID)"
        return
    fi

    # Add guideline
    local add_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_guideline","arguments":{"action":"add","scopeType":"project","scopeId":"'$project_id'","name":"test-guideline","category":"code_style","content":"Always use semicolons in JavaScript","priority":5}},"id":3}'
    local response=$(send_request "$add_request" "$runner")

    check_response "$response" 'success.*true' "Guideline added successfully"

    # List guidelines
    local list_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_guideline","arguments":{"action":"list","scopeType":"project","scopeId":"'$project_id'"}},"id":4}'
    response=$(send_request "$list_request" "$runner")
    check_response "$response" 'guidelines' "Guideline list returns array"
}

test_knowledge_crud() {
    local runner="$1"
    log_section "Testing Knowledge CRUD ($runner)"

    # Initialize and create project
    local init_request='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
    send_request "$init_request" "$runner" > /dev/null

    local create_project='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_project","arguments":{"action":"create","name":"knowledge-test-'$RANDOM'"}},"id":2}'
    local proj_response=$(send_request "$create_project" "$runner")
    local project_id=$(echo "$proj_response" | grep -oE '\\?"id\\?"[[:space:]]*:[[:space:]]*\\?"[a-f0-9-]+\\?"' | head -1 | grep -oE '[a-f0-9-]{36}')

    if [ -z "$project_id" ]; then
        log_skip "Knowledge tests (no project ID)"
        return
    fi

    # Add knowledge
    local add_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_knowledge","arguments":{"action":"add","scopeType":"project","scopeId":"'$project_id'","title":"Architecture Decision","category":"decision","content":"We use SQLite for simplicity and portability"}},"id":3}'
    local response=$(send_request "$add_request" "$runner")

    check_response "$response" 'success.*true' "Knowledge added successfully"

    # List knowledge
    local list_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_knowledge","arguments":{"action":"list","scopeType":"project","scopeId":"'$project_id'"}},"id":4}'
    response=$(send_request "$list_request" "$runner")
    check_response "$response" 'knowledge' "Knowledge list returns array"
}

test_tool_crud() {
    local runner="$1"
    log_section "Testing Tool CRUD ($runner)"

    # Initialize and create project
    local init_request='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
    send_request "$init_request" "$runner" > /dev/null

    local create_project='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_project","arguments":{"action":"create","name":"tool-test-'$RANDOM'"}},"id":2}'
    local proj_response=$(send_request "$create_project" "$runner")
    local project_id=$(echo "$proj_response" | grep -oE '\\?"id\\?"[[:space:]]*:[[:space:]]*\\?"[a-f0-9-]+\\?"' | head -1 | grep -oE '[a-f0-9-]{36}')

    if [ -z "$project_id" ]; then
        log_skip "Tool tests (no project ID)"
        return
    fi

    # Add tool
    local add_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_tool","arguments":{"action":"add","scopeType":"project","scopeId":"'$project_id'","name":"my-cli-tool","category":"cli","description":"A test CLI tool"}},"id":3}'
    local response=$(send_request "$add_request" "$runner")

    check_response "$response" 'success.*true' "Tool added successfully"

    # List tools
    local list_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_tool","arguments":{"action":"list","scopeType":"project","scopeId":"'$project_id'"}},"id":4}'
    response=$(send_request "$list_request" "$runner")
    check_response "$response" 'tools' "Tool list returns array"
}

test_backup_service() {
    local runner="$1"
    log_section "Testing Backup Service ($runner)"

    # Initialize
    local init_request='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
    send_request "$init_request" "$runner" > /dev/null

    # Create backup
    local backup_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_backup","arguments":{"action":"create"}},"id":2}'
    local response=$(send_request "$backup_request" "$runner")

    check_response "$response" 'success.*true' "Backup created successfully"
    check_response "$response" 'backupPath' "Backup path returned"

    # List backups
    local list_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_backup","arguments":{"action":"list"}},"id":3}'
    response=$(send_request "$list_request" "$runner")
    check_response "$response" 'backups' "Backup list returns array"
    check_response "$response" 'backupDirectory' "Backup directory returned"

    # Check backup file exists
    if [ "$runner" = "npm" ]; then
        local backup_dir="$TEST_DATA_DIR/backups"
    else
        local backup_dir="$TEST_DATA_DIR/backups"
    fi

    if [ -d "$backup_dir" ] && [ "$(ls -A "$backup_dir" 2>/dev/null)" ]; then
        log_success "Backup files exist in $backup_dir"
    else
        log_fail "No backup files found in $backup_dir"
    fi

    # Create named backup
    local named_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_backup","arguments":{"action":"create","name":"test-backup"}},"id":4}'
    response=$(send_request "$named_request" "$runner")
    check_response "$response" 'success.*true' "Named backup created"

    # Cleanup (keep 1)
    local cleanup_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_backup","arguments":{"action":"cleanup","keepCount":1}},"id":5}'
    response=$(send_request "$cleanup_request" "$runner")
    check_response "$response" 'success.*true' "Backup cleanup successful"
}

test_export_service() {
    local runner="$1"
    log_section "Testing Export Service ($runner)"

    # Initialize
    local init_request='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
    send_request "$init_request" "$runner" > /dev/null

    # Export to JSON (content only)
    local export_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_export","arguments":{"action":"export","format":"json"}},"id":2}'
    local response=$(send_request "$export_request" "$runner")
    check_response "$response" 'success.*true' "Export successful"
    check_response "$response" 'format.*json' "Export format is JSON"
    check_response "$response" 'content' "Export contains content"

    # Export to file
    local file_export='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_export","arguments":{"action":"export","format":"json","filename":"test-export"}},"id":3}'
    response=$(send_request "$file_export" "$runner")
    check_response "$response" 'success.*true' "File export successful"
    check_response "$response" 'filePath' "File path returned"

    # Check export file exists
    if [ "$runner" = "npm" ]; then
        local export_file="$TEST_DATA_DIR/exports/test-export.json"
    else
        local export_file="$TEST_DATA_DIR/exports/test-export.json"
    fi

    check_file_exists "$export_file" "Export file created"

    # Export markdown
    local md_export='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_export","arguments":{"action":"export","format":"markdown","filename":"test-docs"}},"id":4}'
    response=$(send_request "$md_export" "$runner")
    check_response "$response" 'format.*markdown' "Markdown export format correct"
}

test_query_service() {
    local runner="$1"
    log_section "Testing Query Service ($runner)"

    # Initialize
    local init_request='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
    send_request "$init_request" "$runner" > /dev/null

    # Search query
    local search_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_query","arguments":{"action":"search","types":["guidelines","knowledge","tools"]}},"id":2}'
    local response=$(send_request "$search_request" "$runner")
    check_response "$response" 'results' "Search returns results"

    # Context query (returns scope, tools, guidelines, knowledge, meta)
    local context_request='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_query","arguments":{"action":"context","scopeType":"global"}},"id":3}'
    response=$(send_request "$context_request" "$runner")
    check_response "$response" 'scope' "Context query returns scope"
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║       Agent Memory MCP Server - Manual Test Suite             ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log_info "Test mode: $TEST_MODE"
    log_info "Test data directory: $TEST_DATA_DIR"
    log_info "Project directory: $PROJECT_DIR"

    # Create test data directory
    mkdir -p "$TEST_DATA_DIR"/{backups,exports,logs}

    # Check prerequisites
    if [ "$TEST_MODE" = "npm" ] || [ "$TEST_MODE" = "both" ]; then
        if [ ! -f "$PROJECT_DIR/dist/cli.js" ]; then
            log_fail "dist/cli.js not found. Run 'npm run build' first."
            exit 1
        fi
        log_info "npm version: ready"
    fi

    if [ "$TEST_MODE" = "docker" ] || [ "$TEST_MODE" = "both" ]; then
        if ! docker image inspect coccobas/agent-memory:latest > /dev/null 2>&1; then
            log_info "Pulling Docker image..."
            docker pull coccobas/agent-memory:latest
        fi
        log_info "Docker version: ready"
    fi

    # Run tests for npm
    if [ "$TEST_MODE" = "npm" ] || [ "$TEST_MODE" = "both" ]; then
        echo ""
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}                    TESTING NPM VERSION                        ${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

        # Clean test directory for npm tests
        rm -rf "$TEST_DATA_DIR"/*
        mkdir -p "$TEST_DATA_DIR"/{backups,exports,logs}

        test_initialization "npm"
        test_health_check "npm"
        test_data_dir_resolution "npm"
        test_project_crud "npm"
        test_guideline_crud "npm"
        test_knowledge_crud "npm"
        test_tool_crud "npm"
        test_backup_service "npm"
        test_export_service "npm"
        test_query_service "npm"
    fi

    # Run tests for Docker
    if [ "$TEST_MODE" = "docker" ] || [ "$TEST_MODE" = "both" ]; then
        echo ""
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}                   TESTING DOCKER VERSION                      ${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

        # Clean test directory for Docker tests
        rm -rf "$TEST_DATA_DIR"/*
        mkdir -p "$TEST_DATA_DIR"/{backups,exports,logs}

        test_initialization "docker"
        test_health_check "docker"
        test_data_dir_resolution "docker"
        test_project_crud "docker"
        test_guideline_crud "docker"
        test_knowledge_crud "docker"
        test_tool_crud "docker"
        test_backup_service "docker"
        test_export_service "docker"
        test_query_service "docker"
    fi

    # Cleanup
    log_section "Cleanup"
    rm -rf "$TEST_DATA_DIR"
    log_info "Test data directory removed"

    # Summary
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                        TEST SUMMARY                           ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${GREEN}Passed:${NC}  $TESTS_PASSED"
    echo -e "  ${RED}Failed:${NC}  $TESTS_FAILED"
    echo -e "  ${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed.${NC}"
        exit 1
    fi
}

# Run main
main "$@"
