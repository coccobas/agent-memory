-- =============================================================================
-- Agent Memory Database - Bootstrap Data
-- =============================================================================
-- This file contains sample data to demonstrate the schema and provide
-- a starting point for new installations.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PREDEFINED TAGS
-- -----------------------------------------------------------------------------

-- Languages
INSERT INTO tags (id, name, category, is_predefined, description) VALUES
    ('tag-lang-python', 'python', 'language', TRUE, 'Python programming language'),
    ('tag-lang-typescript', 'typescript', 'language', TRUE, 'TypeScript programming language'),
    ('tag-lang-javascript', 'javascript', 'language', TRUE, 'JavaScript programming language'),
    ('tag-lang-rust', 'rust', 'language', TRUE, 'Rust programming language'),
    ('tag-lang-go', 'go', 'language', TRUE, 'Go programming language'),
    ('tag-lang-sql', 'sql', 'language', TRUE, 'SQL query language'),
    ('tag-lang-bash', 'bash', 'language', TRUE, 'Bash shell scripting');

-- Domains
INSERT INTO tags (id, name, category, is_predefined, description) VALUES
    ('tag-domain-web', 'web', 'domain', TRUE, 'Web development'),
    ('tag-domain-cli', 'cli', 'domain', TRUE, 'Command-line interfaces'),
    ('tag-domain-api', 'api', 'domain', TRUE, 'API development'),
    ('tag-domain-database', 'database', 'domain', TRUE, 'Database design and operations'),
    ('tag-domain-ml', 'ml', 'domain', TRUE, 'Machine learning'),
    ('tag-domain-devops', 'devops', 'domain', TRUE, 'DevOps and infrastructure'),
    ('tag-domain-security', 'security', 'domain', TRUE, 'Security practices'),
    ('tag-domain-testing', 'testing', 'domain', TRUE, 'Testing and QA');

-- Categories
INSERT INTO tags (id, name, category, is_predefined, description) VALUES
    ('tag-cat-code-style', 'code_style', 'category', TRUE, 'Code formatting and style'),
    ('tag-cat-architecture', 'architecture', 'category', TRUE, 'System architecture'),
    ('tag-cat-behavior', 'behavior', 'category', TRUE, 'Agent behavior rules'),
    ('tag-cat-performance', 'performance', 'category', TRUE, 'Performance optimization'),
    ('tag-cat-error-handling', 'error_handling', 'category', TRUE, 'Error handling patterns'),
    ('tag-cat-logging', 'logging', 'category', TRUE, 'Logging practices');

-- Meta tags
INSERT INTO tags (id, name, category, is_predefined, description) VALUES
    ('tag-meta-deprecated', 'deprecated', 'meta', TRUE, 'Deprecated, should not be used'),
    ('tag-meta-experimental', 'experimental', 'meta', TRUE, 'Experimental, may change'),
    ('tag-meta-stable', 'stable', 'meta', TRUE, 'Stable and production-ready'),
    ('tag-meta-required', 'required', 'meta', TRUE, 'Required/mandatory'),
    ('tag-meta-optional', 'optional', 'meta', TRUE, 'Optional/nice-to-have');

-- -----------------------------------------------------------------------------
-- 2. DEFAULT ORGANIZATION
-- -----------------------------------------------------------------------------

INSERT INTO organizations (id, name, metadata) VALUES
    ('org-default', 'Personal', '{"description": "Default personal organization"}');

-- -----------------------------------------------------------------------------
-- 3. SAMPLE PROJECT
-- -----------------------------------------------------------------------------

INSERT INTO projects (id, org_id, name, description, root_path, metadata) VALUES
    ('proj-memory-db', 'org-default', 'Agent Memory Database',
     'MCP server providing structured memory backend for AI agents',
     '/Users/b.cocco/coccobas/Memory',
     '{
        "goals": [
            "Reduce token usage by surgical memory queries",
            "Enable multi-agent concurrent access",
            "Persist context across sessions"
        ],
        "constraints": [
            "Must work with SQLite and PostgreSQL",
            "MCP-compliant interface",
            "Sub-100ms query latency"
        ],
        "status": "design-phase"
     }');

-- Tag the project
INSERT INTO entry_tags (id, entry_type, entry_id, tag_id) VALUES
    ('et-proj-ts', 'project', 'proj-memory-db', 'tag-lang-typescript'),
    ('et-proj-sql', 'project', 'proj-memory-db', 'tag-lang-sql'),
    ('et-proj-api', 'project', 'proj-memory-db', 'tag-domain-api'),
    ('et-proj-db', 'project', 'proj-memory-db', 'tag-domain-database');

-- -----------------------------------------------------------------------------
-- 4. GLOBAL TOOLS
-- -----------------------------------------------------------------------------

-- Tool: File Read
INSERT INTO tools (id, scope_type, scope_id, name, category, is_active, created_by) VALUES
    ('tool-file-read', 'global', NULL, 'file_read', 'cli', TRUE, 'bootstrap');

INSERT INTO tool_versions (id, tool_id, version_num, description, parameters, examples, constraints, created_by, change_reason) VALUES
    ('tv-file-read-1', 'tool-file-read', 1,
     'Read contents of a file from the filesystem',
     '{
        "file_path": {
            "type": "string",
            "required": true,
            "description": "Absolute path to the file"
        },
        "offset": {
            "type": "integer",
            "required": false,
            "description": "Line number to start reading from"
        },
        "limit": {
            "type": "integer",
            "required": false,
            "description": "Number of lines to read"
        }
     }',
     '[
        {"input": {"file_path": "/src/main.ts"}, "description": "Read entire file"},
        {"input": {"file_path": "/src/main.ts", "offset": 100, "limit": 50}, "description": "Read lines 100-150"}
     ]',
     'Must use absolute paths. Cannot read directories.',
     'bootstrap', 'Initial version');

UPDATE tools SET current_version_id = 'tv-file-read-1' WHERE id = 'tool-file-read';

-- Tool: File Write
INSERT INTO tools (id, scope_type, scope_id, name, category, is_active, created_by) VALUES
    ('tool-file-write', 'global', NULL, 'file_write', 'cli', TRUE, 'bootstrap');

INSERT INTO tool_versions (id, tool_id, version_num, description, parameters, examples, constraints, created_by, change_reason) VALUES
    ('tv-file-write-1', 'tool-file-write', 1,
     'Write content to a file, creating or overwriting',
     '{
        "file_path": {
            "type": "string",
            "required": true,
            "description": "Absolute path to the file"
        },
        "content": {
            "type": "string",
            "required": true,
            "description": "Content to write"
        }
     }',
     '[
        {"input": {"file_path": "/src/new.ts", "content": "export const x = 1;"}, "description": "Create new file"}
     ]',
     'Will overwrite existing files. Parent directory must exist.',
     'bootstrap', 'Initial version');

UPDATE tools SET current_version_id = 'tv-file-write-1' WHERE id = 'tool-file-write';

-- Tool: Git Commit
INSERT INTO tools (id, scope_type, scope_id, name, category, is_active, created_by) VALUES
    ('tool-git-commit', 'global', NULL, 'git_commit', 'cli', TRUE, 'bootstrap');

INSERT INTO tool_versions (id, tool_id, version_num, description, parameters, examples, constraints, created_by, change_reason) VALUES
    ('tv-git-commit-1', 'tool-git-commit', 1,
     'Create a git commit with staged changes',
     '{
        "message": {
            "type": "string",
            "required": true,
            "description": "Commit message"
        },
        "amend": {
            "type": "boolean",
            "required": false,
            "default": false,
            "description": "Amend the previous commit"
        }
     }',
     '[
        {"input": {"message": "feat: add user authentication"}, "description": "Standard commit"},
        {"input": {"message": "fix typo", "amend": true}, "description": "Amend previous commit"}
     ]',
     'Never amend commits that have been pushed. Always check authorship before amending.',
     'bootstrap', 'Initial version');

UPDATE tools SET current_version_id = 'tv-git-commit-1' WHERE id = 'tool-git-commit';

-- Tool: SQL Query
INSERT INTO tools (id, scope_type, scope_id, name, category, is_active, created_by) VALUES
    ('tool-sql-query', 'global', NULL, 'sql_query', 'function', TRUE, 'bootstrap');

INSERT INTO tool_versions (id, tool_id, version_num, description, parameters, examples, constraints, created_by, change_reason) VALUES
    ('tv-sql-query-1', 'tool-sql-query', 1,
     'Execute a SQL query against the connected database',
     '{
        "query": {
            "type": "string",
            "required": true,
            "description": "SQL query to execute"
        },
        "params": {
            "type": "array",
            "required": false,
            "description": "Parameterized query values"
        }
     }',
     '[
        {"input": {"query": "SELECT * FROM users WHERE id = ?", "params": [123]}, "description": "Parameterized select"}
     ]',
     'Always use parameterized queries. Never concatenate user input.',
     'bootstrap', 'Initial version');

UPDATE tools SET current_version_id = 'tv-sql-query-1' WHERE id = 'tool-sql-query';

-- Tag the tools
INSERT INTO entry_tags (id, entry_type, entry_id, tag_id) VALUES
    ('et-tool-read-cli', 'tool', 'tool-file-read', 'tag-domain-cli'),
    ('et-tool-write-cli', 'tool', 'tool-file-write', 'tag-domain-cli'),
    ('et-tool-git-cli', 'tool', 'tool-git-commit', 'tag-domain-cli'),
    ('et-tool-git-devops', 'tool', 'tool-git-commit', 'tag-domain-devops'),
    ('et-tool-sql-db', 'tool', 'tool-sql-query', 'tag-domain-database'),
    ('et-tool-sql-lang', 'tool', 'tool-sql-query', 'tag-lang-sql');

-- -----------------------------------------------------------------------------
-- 5. GLOBAL GUIDELINES
-- -----------------------------------------------------------------------------

-- Guideline: Never Hardcode Secrets
INSERT INTO guidelines (id, scope_type, scope_id, name, category, priority, is_active, created_by) VALUES
    ('guide-no-secrets', 'global', NULL, 'never_hardcode_secrets', 'security', 100, TRUE, 'bootstrap');

INSERT INTO guideline_versions (id, guideline_id, version_num, content, rationale, examples, created_by, change_reason) VALUES
    ('gv-no-secrets-1', 'guide-no-secrets', 1,
     'Never hardcode secrets, API keys, passwords, or sensitive credentials in source code. Use environment variables or secure vaults.',
     'Hardcoded secrets can be accidentally committed to version control and exposed publicly.',
     '{
        "bad": [
            "const API_KEY = \"sk-1234567890abcdef\";",
            "password: \"admin123\""
        ],
        "good": [
            "const API_KEY = process.env.API_KEY;",
            "password: env(\"DB_PASSWORD\")"
        ]
     }',
     'bootstrap', 'Initial version');

UPDATE guidelines SET current_version_id = 'gv-no-secrets-1' WHERE id = 'guide-no-secrets';

-- Guideline: Read Before Edit
INSERT INTO guidelines (id, scope_type, scope_id, name, category, priority, is_active, created_by) VALUES
    ('guide-read-before-edit', 'global', NULL, 'read_before_edit', 'behavior', 90, TRUE, 'bootstrap');

INSERT INTO guideline_versions (id, guideline_id, version_num, content, rationale, examples, created_by, change_reason) VALUES
    ('gv-read-before-edit-1', 'guide-read-before-edit', 1,
     'Always read a file before editing it. Never propose changes to code you have not seen.',
     'Understanding existing code prevents breaking changes and ensures edits fit the existing style and patterns.',
     '{
        "bad": [
            "Suggesting changes to a function without reading its implementation",
            "Adding imports without checking existing imports"
        ],
        "good": [
            "Read the file first, then propose targeted edits",
            "Check existing patterns before adding new code"
        ]
     }',
     'bootstrap', 'Initial version');

UPDATE guidelines SET current_version_id = 'gv-read-before-edit-1' WHERE id = 'guide-read-before-edit';

-- Guideline: Minimal Changes
INSERT INTO guidelines (id, scope_type, scope_id, name, category, priority, is_active, created_by) VALUES
    ('guide-minimal-changes', 'global', NULL, 'minimal_changes', 'behavior', 80, TRUE, 'bootstrap');

INSERT INTO guideline_versions (id, guideline_id, version_num, content, rationale, examples, created_by, change_reason) VALUES
    ('gv-minimal-changes-1', 'guide-minimal-changes', 1,
     'Make only the changes necessary to complete the task. Do not refactor unrelated code, add features not requested, or make "improvements" beyond scope.',
     'Minimal changes reduce risk, make reviews easier, and respect the user''s codebase decisions.',
     '{
        "bad": [
            "Refactoring a function while fixing a bug in it",
            "Adding TypeScript types to files you did not need to touch",
            "Converting callbacks to async/await in unrelated code"
        ],
        "good": [
            "Fix only the specific bug",
            "Leave surrounding code as-is",
            "Note potential improvements separately if important"
        ]
     }',
     'bootstrap', 'Initial version');

UPDATE guidelines SET current_version_id = 'gv-minimal-changes-1' WHERE id = 'guide-minimal-changes';

-- Guideline: Parameterized SQL
INSERT INTO guidelines (id, scope_type, scope_id, name, category, priority, is_active, created_by) VALUES
    ('guide-param-sql', 'global', NULL, 'parameterized_sql', 'security', 95, TRUE, 'bootstrap');

INSERT INTO guideline_versions (id, guideline_id, version_num, content, rationale, examples, created_by, change_reason) VALUES
    ('gv-param-sql-1', 'guide-param-sql', 1,
     'Always use parameterized queries for SQL. Never concatenate user input into query strings.',
     'SQL injection is one of the most common and dangerous vulnerabilities. Parameterized queries prevent it entirely.',
     '{
        "bad": [
            "query(`SELECT * FROM users WHERE id = ${userId}`)",
            "\"SELECT * FROM users WHERE name = ''\" + name + \"''\""
        ],
        "good": [
            "query(\"SELECT * FROM users WHERE id = ?\", [userId])",
            "query(\"SELECT * FROM users WHERE name = $1\", [name])"
        ]
     }',
     'bootstrap', 'Initial version');

UPDATE guidelines SET current_version_id = 'gv-param-sql-1' WHERE id = 'guide-param-sql';

-- Tag guidelines
INSERT INTO entry_tags (id, entry_type, entry_id, tag_id) VALUES
    ('et-guide-secrets-sec', 'guideline', 'guide-no-secrets', 'tag-domain-security'),
    ('et-guide-secrets-req', 'guideline', 'guide-no-secrets', 'tag-meta-required'),
    ('et-guide-read-beh', 'guideline', 'guide-read-before-edit', 'tag-cat-behavior'),
    ('et-guide-read-req', 'guideline', 'guide-read-before-edit', 'tag-meta-required'),
    ('et-guide-min-beh', 'guideline', 'guide-minimal-changes', 'tag-cat-behavior'),
    ('et-guide-sql-sec', 'guideline', 'guide-param-sql', 'tag-domain-security'),
    ('et-guide-sql-db', 'guideline', 'guide-param-sql', 'tag-domain-database'),
    ('et-guide-sql-lang', 'guideline', 'guide-param-sql', 'tag-lang-sql');

-- -----------------------------------------------------------------------------
-- 6. PROJECT-SPECIFIC GUIDELINES
-- -----------------------------------------------------------------------------

-- Guideline: TypeScript Strict Mode (for this project)
INSERT INTO guidelines (id, scope_type, scope_id, name, category, priority, is_active, created_by) VALUES
    ('guide-ts-strict', 'project', 'proj-memory-db', 'typescript_strict', 'code_style', 70, TRUE, 'bootstrap');

INSERT INTO guideline_versions (id, guideline_id, version_num, content, rationale, examples, created_by, change_reason) VALUES
    ('gv-ts-strict-1', 'guide-ts-strict', 1,
     'Use TypeScript strict mode. All functions must have explicit return types. Avoid `any` type.',
     'Strict typing catches errors at compile time and improves code documentation.',
     '{
        "bad": [
            "function getData() { return fetch(...) }",
            "const x: any = getValue();"
        ],
        "good": [
            "function getData(): Promise<Data> { return fetch(...) }",
            "const x: UserData = getValue();"
        ]
     }',
     'bootstrap', 'Initial version');

UPDATE guidelines SET current_version_id = 'gv-ts-strict-1' WHERE id = 'guide-ts-strict';

INSERT INTO entry_tags (id, entry_type, entry_id, tag_id) VALUES
    ('et-guide-ts-lang', 'guideline', 'guide-ts-strict', 'tag-lang-typescript'),
    ('et-guide-ts-style', 'guideline', 'guide-ts-strict', 'tag-cat-code-style');

-- -----------------------------------------------------------------------------
-- 7. KNOWLEDGE ENTRIES
-- -----------------------------------------------------------------------------

-- Knowledge: Architecture Decision
INSERT INTO knowledge (id, scope_type, scope_id, title, category, is_active, created_by) VALUES
    ('know-arch-append', 'project', 'proj-memory-db', 'Append-Only Versioning Decision', 'decision', TRUE, 'bootstrap');

INSERT INTO knowledge_versions (id, knowledge_id, version_num, content, source, confidence, created_by, change_reason) VALUES
    ('kv-arch-append-1', 'know-arch-append', 1,
     'We chose append-only versioning with a current_version_id pointer for all memory entries. This allows concurrent writes from multiple agents while preserving complete history. Conflicts are detected when two writes occur within 5 seconds of each other and flagged for review.',
     'Architecture discussion 2024-01-15',
     1.0,
     'bootstrap', 'Initial decision');

UPDATE knowledge SET current_version_id = 'kv-arch-append-1' WHERE id = 'know-arch-append';

-- Knowledge: Technology Choice
INSERT INTO knowledge (id, scope_type, scope_id, title, category, is_active, created_by) VALUES
    ('know-tech-sqlite', 'project', 'proj-memory-db', 'SQLite First Strategy', 'decision', TRUE, 'bootstrap');

INSERT INTO knowledge_versions (id, knowledge_id, version_num, content, source, confidence, created_by, change_reason) VALUES
    ('kv-tech-sqlite-1', 'know-tech-sqlite', 1,
     'Starting with SQLite for development and single-user scenarios. Schema is designed to be PostgreSQL-compatible for future migration. Key differences to handle: no native JSON operators in SQLite (use json_extract), different timestamp handling.',
     'Technical planning',
     1.0,
     'bootstrap', 'Initial decision');

UPDATE knowledge SET current_version_id = 'kv-tech-sqlite-1' WHERE id = 'know-tech-sqlite';

-- Knowledge: MCP Tool Design
INSERT INTO knowledge (id, scope_type, scope_id, title, category, is_active, created_by) VALUES
    ('know-mcp-design', 'project', 'proj-memory-db', 'MCP Tool Naming Convention', 'decision', TRUE, 'bootstrap');

INSERT INTO knowledge_versions (id, knowledge_id, version_num, content, source, confidence, created_by, change_reason) VALUES
    ('kv-mcp-design-1', 'know-mcp-design', 1,
     'All MCP tools follow the pattern: memory_{entity}_{action}. Examples: memory_tool_add, memory_guideline_list, memory_query. The memory_ prefix ensures no conflicts with other MCP servers. The main query tool is memory_query which handles cross-reference searches.',
     'API design discussion',
     1.0,
     'bootstrap', 'Initial decision');

UPDATE knowledge SET current_version_id = 'kv-mcp-design-1' WHERE id = 'know-mcp-design';

-- Tag knowledge
INSERT INTO entry_tags (id, entry_type, entry_id, tag_id) VALUES
    ('et-know-append-arch', 'knowledge', 'know-arch-append', 'tag-cat-architecture'),
    ('et-know-sqlite-db', 'knowledge', 'know-tech-sqlite', 'tag-domain-database'),
    ('et-know-mcp-api', 'knowledge', 'know-mcp-design', 'tag-domain-api');

-- -----------------------------------------------------------------------------
-- 8. ENTRY RELATIONS
-- -----------------------------------------------------------------------------

-- Link SQL tool to parameterized SQL guideline
INSERT INTO entry_relations (id, source_type, source_id, target_type, target_id, relation_type, created_by) VALUES
    ('rel-sql-guide', 'tool', 'tool-sql-query', 'guideline', 'guide-param-sql', 'applies_to', 'bootstrap');

-- Link file tools to read-before-edit guideline
INSERT INTO entry_relations (id, source_type, source_id, target_type, target_id, relation_type, created_by) VALUES
    ('rel-write-read', 'tool', 'tool-file-write', 'guideline', 'guide-read-before-edit', 'applies_to', 'bootstrap');

-- Link project to its architecture decision
INSERT INTO entry_relations (id, source_type, source_id, target_type, target_id, relation_type, created_by) VALUES
    ('rel-proj-arch', 'project', 'proj-memory-db', 'knowledge', 'know-arch-append', 'related_to', 'bootstrap');

-- Link TypeScript guideline to the project
INSERT INTO entry_relations (id, source_type, source_id, target_type, target_id, relation_type, created_by) VALUES
    ('rel-ts-proj', 'guideline', 'guide-ts-strict', 'project', 'proj-memory-db', 'applies_to', 'bootstrap');

-- -----------------------------------------------------------------------------
-- 9. SAMPLE SESSION
-- -----------------------------------------------------------------------------

INSERT INTO sessions (id, project_id, name, purpose, agent_id, status, metadata) VALUES
    ('sess-design-001', 'proj-memory-db', 'Architecture Design Session',
     'Design the database schema and MCP interface',
     'claude-code-main',
     'active',
     '{
        "mode": "working_period",
        "auto_promote": true,
        "notes": "Working on initial architecture document"
     }');

-- =============================================================================
-- END BOOTSTRAP DATA
-- =============================================================================
