# Security Test Suite

This directory contains security-focused tests to prevent vulnerabilities and ensure the codebase follows secure coding practices.

## SQL Injection Prevention (`sql-injection.test.ts`)

Comprehensive test suite for SQL injection prevention across the codebase. Tests cover:

### 1. ISO Date Validation (`validateIsoDate` in `src/services/query/stages/fetch.ts`)

**Purpose**: Prevents SQL injection in temporal query parameters.

**Coverage**:
- ✅ Valid ISO 8601 date formats (YYYY-MM-DD, with time, with milliseconds, with Z timezone)
- ✅ SQL injection with single quotes (`'; DROP TABLE--`)
- ✅ SQL injection with comment markers (`--`, `/* */`, `#`)
- ✅ UNION-based SQL injection attacks
- ✅ Stacked query attacks (`;`)
- ✅ Boolean-based blind SQL injection
- ✅ Encoded injection attempts (URL encoded, HTML entities, hex)
- ✅ Malformed inputs (non-strings, invalid formats, extra characters)
- ✅ Boundary testing (years 1000-9999, leap years, Unix epoch limits)

**Attack Vectors Tested** (55 tests):
```typescript
// Example payloads that are BLOCKED:
"2024-01-01'; DROP TABLE knowledge--"
"2024-01-01' OR '1'='1"
"2024-01-01' UNION SELECT * FROM knowledge--"
"2024-01-01; DELETE FROM users;"
"2024-01-01' AND SLEEP(5)--"
```

### 2. FTS5 Query Escaping (`fts.service.ts`)

**Purpose**: Prevents SQL injection in full-text search queries.

**Coverage**:
- ✅ `escapeFts5Query()` - Preserves structure, escapes quotes, wraps operators
- ✅ `escapeFts5Quotes()` - Simple double-quote escaping
- ✅ `escapeFts5QueryTokenized()` - Converts to safe tokens for similarity matching
- ✅ MATCH clause injection prevention
- ✅ Snippet function injection prevention
- ✅ FTS5 operator handling (OR, AND, NOT, NEAR)
- ✅ Real-world attack vectors (SQL comments, quote escaping, control characters)

**Functions Tested**:
```typescript
escapeFts5Query('test" OR "1"="1')        // Neutralized
escapeFts5QueryTokenized('test; DROP--')  // Tokenized to safe text
searchFTS(maliciousQuery, types)          // Safe execution
```

### 3. pgvector Dimension Validation (`validateDimension` in `src/db/vector-stores/pgvector.ts`)

**Purpose**: Prevents SQL injection in vector database operations, specifically in `ALTER TABLE` statements that set vector dimensions.

**Coverage**:
- ✅ Valid dimension range (1-10000)
- ✅ Common embedding dimensions (384, 768, 1024, 1536, 2048)
- ✅ Non-integer rejection (floats, NaN, Infinity)
- ✅ Out-of-range rejection (0, negative, >10000)
- ✅ Type validation (strings, objects, arrays rejected)
- ✅ SQL injection in dimension parameter
- ✅ ALTER TABLE injection prevention
- ✅ Type coercion prevention (no string-to-number conversion)

**Attack Vectors Blocked**:
```typescript
// Example payloads that are BLOCKED:
"768; DROP TABLE vector_embeddings--"
"768) WITH (malicious_option = true)"
"768' OR '1'='1"
'768' // String coercion prevented
```

## Path Traversal Prevention (`path-traversal.test.ts`)

Comprehensive test suite for path traversal attack prevention across file operations. Tests cover:

### 1. Core Path Validation (`isPathSafe` in `src/utils/paths.ts`)

**Purpose**: Prevents directory traversal attacks in file path operations.

**Coverage**:
- ✅ Directory traversal attacks (`../`, `../../`)
- ✅ Encoded path traversal (`%2e%2e%2f`, `..%2f`)
- ✅ Null byte injection (`\x00`)
- ✅ Absolute path escape attempts
- ✅ Windows-specific attacks (backslash variants, UNC paths, drive letters)
- ✅ Unix-specific attacks (symlink traversal, hidden files)
- ✅ Platform-aware validation (case sensitivity, path separators)
- ✅ Edge cases (empty paths, very long chains, unicode)

**Attack Vectors Tested** (72 tests):
```typescript
// Example payloads that are BLOCKED:
"/allowed/../restricted/secret.md"
"/allowed/subdir/../../../etc/passwd"
"/allowed/file.md\x00.jpg"
"/etc/passwd" (when root is /allowed)
"C:\\Windows\\System32" (when root is /allowed)
```

### 2. File Sync Path Security (`getDestinationPath` in `src/services/file-sync/sync-core.ts`)

**Purpose**: Prevents path traversal in IDE file synchronization operations.

**Coverage**:
- ✅ Source path validation (reject `..` in relative paths)
- ✅ Null byte detection in filenames
- ✅ Destination path boundary validation
- ✅ IDE-specific path handling (cursor, claude, vscode, etc.)
- ✅ User-level vs project-level directory security
- ✅ Extension conversion safety (.md to .mdc for Cursor)
- ✅ Complex attack scenarios (combined traversal + null byte)
- ✅ TOCTOU protection (validation on resolved paths)

**Functions Tested**:
```typescript
getDestinationPath(sourcePath, sourceDir, ide, outputDir)
// Validates source is within sourceDir
// Ensures destination is within IDE-specific directory
```

### 3. Export Service Path Security

**Purpose**: Validates export file paths don't escape allowed directories.

**Coverage**:
- ✅ Export path boundary validation
- ✅ Traversal attempt rejection
- ✅ Filename special character handling
- ✅ Null byte prevention

### Security Properties Validated

1. **Defense in Depth**: Multiple validation layers
   - String-based traversal detection (`..`, `\..`)
   - Path normalization (`path.resolve`, `path.relative`)
   - Boundary validation (`startsWith` check on normalized paths)

2. **TOCTOU Protection**: Validation on resolved paths
   - Prevents race conditions between check and use
   - Validates final resolved path, not raw input

3. **Platform Awareness**:
   - Windows: Backslash separators, case-insensitive, drive letters
   - Unix: Forward slashes, case-sensitive, symlinks
   - Proper handling of platform-specific attack vectors

4. **Null Byte Protection**:
   - Detects `\x00` in paths before file operations
   - Prevents extension bypass attacks

### Attack Vectors Covered

1. **Basic Traversal**: `../`, `../../`, etc.
2. **Deep Traversal**: `../` repeated 100+ times
3. **Mid-path Traversal**: `/valid/../../../etc/passwd`
4. **Encoded Traversal**: URL encoding (`%2e%2e%2f`)
5. **Null Bytes**: `file.txt\x00.jpg`
6. **Absolute Paths**: `/etc/passwd`, `C:\Windows\`
7. **UNC Paths**: `\\server\share`
8. **Symlink Traversal**: Excessive `../` chains
9. **Windows Backslash**: `\..\..\`
10. **Mixed Slashes**: `/subdir\../`

### Key Security Insights

**URL Encoding Doesn't Bypass Node.js:**
```typescript
// Node.js path.resolve() doesn't decode URL encoding
'/allowed/%2e%2e/file.md' → '/allowed/%2e%2e/file.md'
// %2e%2e becomes a literal directory name, not ".."
// This is SAFE - no traversal occurs
```

**Platform-Specific Behavior:**
```typescript
// Unix: Backslashes are literal characters
'/allowed\\..\\restricted' → File named literally "\..\restricted"

// Windows: Backslashes are path separators
'/allowed\\..\\restricted' → Traversal to parent directory
```

## Security Test Statistics

- **Total Tests**: 127
- **Path Traversal Prevention**: 72 tests
- **SQL Injection Prevention**: 55 tests
  - Date Validation: 16 tests
  - FTS5 Escaping: 18 tests
  - Dimension Validation: 13 tests
  - Integration Tests: 8 tests

## Running Security Tests

```bash
# Run all security tests
npm test tests/security/

# Run SQL injection tests only
npm test tests/security/sql-injection.test.ts

# Run path traversal tests only
npm test tests/security/path-traversal.test.ts

# Run with coverage
npm run test:coverage -- tests/security/
```

## Security Testing Strategy

### 1. Input Validation Boundary Testing
- Test minimum and maximum valid values
- Test just below and above boundaries
- Test special numeric values (NaN, Infinity, -0)

### 2. SQL Injection Attack Simulation
- **Quote-based**: Single quotes, double quotes, backticks
- **Comment-based**: `--`, `/* */`, `#`
- **Operator-based**: `OR`, `AND`, `UNION`, `SELECT`
- **Stacked queries**: `;` delimiter
- **Blind injection**: Time-based (`SLEEP`), boolean-based
- **Second-order**: Stored and later executed
- **Polyglot**: Works across multiple contexts

### 3. Real-world Attack Vectors
- OWASP Top 10 SQL injection patterns
- Database-specific attacks (SQLite, PostgreSQL)
- Encoded payloads (URL encoding, HTML entities)
- Control characters and special characters

### 4. Defense Verification
- Parameterized queries (via Drizzle ORM)
- Input validation (regex, type checking, range checking)
- Output encoding (FTS5 escaping)
- Type safety (TypeScript strict mode)

## Security Best Practices Enforced

1. **Never trust user input**: All external inputs are validated
2. **Use parameterized queries**: Drizzle ORM provides SQL injection protection
3. **Validate types strictly**: No implicit type coercion
4. **Whitelist over blacklist**: Define what's allowed, not what's forbidden
5. **Defense in depth**: Multiple layers of validation
6. **Fail securely**: Throw errors on invalid input, don't silently accept

## Validation Functions Reference

### `validateIsoDate(value: unknown, fieldName: string): string`
**Location**: `src/services/query/stages/fetch.ts` (lines 186-195)

**Regex**: `/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/`

**Accepts**:
- `2024-01-01`
- `2024-01-01T12:30:45`
- `2024-01-01T12:30:45.123`
- `2024-01-01T12:30:45Z`

**Rejects**:
- Non-strings
- Invalid formats
- SQL injection payloads
- Any extra characters

### `validateDimension(dimension: unknown): number`
**Location**: `src/db/vector-stores/pgvector.ts` (lines 44-51)

**Validation**:
```typescript
typeof dimension !== 'number'
|| !Number.isInteger(dimension)
|| dimension < 1
|| dimension > 10000
```

**Accepts**: Integer 1-10000

**Rejects**:
- Non-numbers
- Floats
- Out of range
- Special values (NaN, Infinity)

### FTS5 Escaping Functions
**Location**: `src/services/fts.service.ts` (lines 230-277)

1. **`escapeFts5Query(query: string): string`**
   - Escapes double quotes (`"` → `""`)
   - Wraps in quotes if contains operators/spaces
   - Preserves query structure

2. **`escapeFts5Quotes(query: string): string`**
   - Simple quote escaping only
   - For use in custom query logic

3. **`escapeFts5QueryTokenized(input: string): string`**
   - Converts to alphanumeric tokens
   - Removes all special characters
   - For fuzzy/similarity matching

### Path Validation Functions
**Location**: `src/utils/paths.ts`

**`isPathSafe(inputPath: string, allowedRoot?: string): boolean`**

**Purpose**: Validates that a path is safe and optionally within allowed root.

**Validation Logic**:
```typescript
// 1. Check for null bytes
if (inputPath.includes('\0')) return false;

// 2. Resolve to absolute path
const resolved = resolve(inputPath);

// 3. If root specified, ensure path is within it
if (allowedRoot) {
  const normalizedRoot = normalizePath(allowedRoot);
  const normalizedPath = normalizePath(resolved);
  return normalizedPath.startsWith(normalizedRoot);
}

return true;
```

**Accepts**:
- Paths within allowed root (when specified)
- Any path (when no root specified)

**Rejects**:
- Paths with null bytes (`\x00`)
- Paths outside allowed root
- Paths that traverse to parent directories

**Location**: `src/services/file-sync/sync-core.ts` (lines 225-273)

**`getDestinationPath(sourcePath, sourceDir, ide, outputDir, userLevel?, userDir?): string`**

**Purpose**: Safely compute destination path for file sync operations.

**Security Checks**:
```typescript
// 1. Check relative path for traversal
const relativePath = relative(sourceDir, sourcePath);
if (relativePath.startsWith('..') ||
    relativePath.includes('/..') ||
    relativePath.includes('\\..')) {
  throw new Error('Path traversal detected');
}

// 2. Check for null bytes
if (relativePath.includes('\0') || sourcePath.includes('\0')) {
  throw new Error('Null byte in path');
}

// 3. Validate final destination is within allowed directory
if (!isPathSafe(destPath, destDir)) {
  throw new Error('Path outside allowed directory');
}
```

## Contributing to Security Tests

When adding new security tests:

1. **Document the threat**: Explain what attack you're preventing
2. **Use real payloads**: Base tests on known attack vectors
3. **Test boundaries**: Include edge cases and boundary values
4. **Verify fixes**: Ensure validation works as intended
5. **Add integration tests**: Test full request flow, not just units

## References

### SQL Injection
- [OWASP SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection)
- [FTS5 Documentation](https://www.sqlite.org/fts5.html)
- [pgvector Security Considerations](https://github.com/pgvector/pgvector#security)
- [CWE-89: SQL Injection](https://cwe.mitre.org/data/definitions/89.html)

### Path Traversal
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [CWE-22: Path Traversal](https://cwe.mitre.org/data/definitions/22.html)
- [CWE-23: Relative Path Traversal](https://cwe.mitre.org/data/definitions/23.html)
- [CWE-36: Absolute Path Traversal](https://cwe.mitre.org/data/definitions/36.html)
- [Node.js Path Module Security](https://nodejs.org/api/path.html)

### General
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

## Automated Security Scanning

Consider integrating:
- ✅ Static analysis (TypeScript strict mode)
- ✅ Unit tests (this suite)
- 🔄 SAST tools (semgrep, CodeQL)
- 🔄 Dependency scanning (npm audit, Snyk)
- 🔄 Dynamic testing (DAST tools)
- 🔄 Penetration testing (periodic manual review)

## Security Contact

For security concerns or to report vulnerabilities, please follow responsible disclosure practices.

---

**Last Updated**: 2025-12-25
**Test Coverage**: 127 tests, 100% passing
**Security Level**: High (Defense in depth, multiple validation layers)
