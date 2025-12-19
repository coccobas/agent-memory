# Examples

Real-world examples of storing and querying memory.

## Table of Contents

- [Code Style Guidelines](#code-style-guidelines)
- [Architecture Decisions](#architecture-decisions)
- [Security Policies](#security-policies)
- [CLI Tool Registry](#cli-tool-registry)
- [Project Knowledge Base](#project-knowledge-base)
- [API Documentation](#api-documentation)

---

## Code Style Guidelines

### TypeScript Project

```json
// Tool: memory_guideline
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-typescript-app",
  "entries": [
    {
      "name": "strict-mode",
      "content": "Enable strict mode in tsconfig.json. Use noImplicitAny, strictNullChecks, and strictFunctionTypes.",
      "category": "code_style",
      "priority": 95,
      "rationale": "Catches type errors at compile time",
      "examples": {
        "good": [
          "const user: User = getUser()",
          "function greet(name: string): string { return `Hello ${name}` }"
        ],
        "bad": [
          "const user: any = getUser()",
          "function greet(name) { return `Hello ${name}` }"
        ]
      }
    },
    {
      "name": "prefer-const",
      "content": "Use const for variables that are never reassigned. Use let only when reassignment is necessary.",
      "category": "code_style",
      "priority": 80,
      "examples": {
        "good": ["const items = []", "let count = 0; count++"],
        "bad": ["let items = []", "var count = 0"]
      }
    },
    {
      "name": "async-await",
      "content": "Prefer async/await over .then() chains. Always handle errors with try-catch.",
      "category": "code_style",
      "priority": 85,
      "examples": {
        "good": [
          "async function fetchUser() { try { const user = await api.getUser(); return user; } catch (e) { logger.error(e); throw e; } }"
        ],
        "bad": [
          "function fetchUser() { return api.getUser().then(user => user).catch(e => { throw e; }) }"
        ]
      }
    },
    {
      "name": "naming-conventions",
      "content": "Use camelCase for variables/functions, PascalCase for classes/types/interfaces, UPPER_SNAKE_CASE for constants.",
      "category": "code_style",
      "priority": 75,
      "examples": {
        "good": [
          "const userName: string",
          "class UserService",
          "interface UserProfile",
          "const MAX_RETRIES = 3"
        ],
        "bad": [
          "const user_name: string",
          "class userService",
          "interface user_profile",
          "const maxRetries = 3"
        ]
      }
    }
  ]
}
```

### Python Project

```json
// Tool: memory_guideline
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-python-app",
  "entries": [
    {
      "name": "type-hints",
      "content": "Use type hints for all function parameters and return values. Use typing module for complex types.",
      "category": "code_style",
      "priority": 90,
      "examples": {
        "good": [
          "def get_user(user_id: int) -> User:",
          "def process_items(items: list[str]) -> dict[str, int]:"
        ],
        "bad": [
          "def get_user(user_id):",
          "def process_items(items):"
        ]
      }
    },
    {
      "name": "docstrings",
      "content": "Use Google-style docstrings for all public functions and classes.",
      "category": "code_style",
      "priority": 80
    },
    {
      "name": "imports",
      "content": "Order imports: stdlib, third-party, local. Use absolute imports. One import per line.",
      "category": "code_style",
      "priority": 70
    }
  ]
}
```

---

## Architecture Decisions

### Database Selection

```json
// Tool: memory_knowledge
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "title": "Database Selection: PostgreSQL",
  "content": "PostgreSQL selected: ACID compliance, native JSONB, window functions, read replicas. Decision: 2024-01-15",
  "category": "decision",
  "confidence": 0.95,
  "source": "Architecture review meeting"
}
```

### Authentication Strategy

```json
// Tool: memory_knowledge
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "title": "Authentication: JWT with Refresh Tokens",
  "content": "JWT auth: access tokens 1hr/RS256, refresh tokens 7 days in HttpOnly cookie. Reuse detection enabled.",
  "category": "decision",
  "confidence": 0.95
}
```

### Microservices vs Monolith

```json
// Tool: memory_knowledge
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "title": "Architecture: Modular Monolith",
  "content": "Modular monolith: small team, clear boundaries, simpler deployment. Modules communicate via interfaces only.",
  "category": "decision",
  "confidence": 0.9
}
```

---

## Security Policies

### Critical Security Guidelines

```json
// Tool: memory_guideline
{
  "action": "bulk_add",
  "scopeType": "global",
  "entries": [
    {
      "name": "no-hardcoded-secrets",
      "content": "NEVER hardcode secrets, API keys, passwords, or credentials in source code. Use environment variables or secret management services.",
      "category": "security",
      "priority": 100,
      "examples": {
        "good": [
          "const apiKey = process.env.API_KEY",
          "const dbPassword = await secretManager.get('db-password')"
        ],
        "bad": [
          "const apiKey = 'sk-abc123...'",
          "const dbPassword = 'mypassword123'"
        ]
      }
    },
    {
      "name": "input-validation",
      "content": "Validate and sanitize ALL user input. Use allowlists over denylists. Validate on server side even if client validates.",
      "category": "security",
      "priority": 95
    },
    {
      "name": "sql-injection-prevention",
      "content": "Use parameterized queries or ORM methods. NEVER concatenate user input into SQL strings.",
      "category": "security",
      "priority": 100,
      "examples": {
        "good": [
          "db.query('SELECT * FROM users WHERE id = $1', [userId])",
          "User.findOne({ where: { id: userId } })"
        ],
        "bad": [
          "db.query(`SELECT * FROM users WHERE id = ${userId}`)",
          "db.query('SELECT * FROM users WHERE id = ' + userId)"
        ]
      }
    },
    {
      "name": "authentication-required",
      "content": "All API endpoints must require authentication except explicitly public routes. Use middleware to enforce.",
      "category": "security",
      "priority": 90
    },
    {
      "name": "sensitive-data-logging",
      "content": "NEVER log passwords, tokens, credit cards, or PII. Mask sensitive fields before logging.",
      "category": "security",
      "priority": 95
    }
  ]
}
```

---

## CLI Tool Registry

### Development Tools

```json
// Tool: memory_tool
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "entries": [
    {
      "name": "dev",
      "description": "Start development server with hot reload and debugging",
      "category": "cli",
      "examples": ["npm run dev"],
      "constraints": "Requires .env.local file"
    },
    {
      "name": "build",
      "description": "Build production bundle with optimization",
      "category": "cli",
      "examples": ["npm run build"],
      "constraints": "Requires Node.js 20+"
    },
    {
      "name": "test",
      "description": "Run test suite",
      "category": "cli",
      "examples": [
        "npm test",
        "npm test -- --watch",
        "npm test -- --coverage"
      ]
    },
    {
      "name": "lint",
      "description": "Run ESLint and fix auto-fixable issues",
      "category": "cli",
      "examples": [
        "npm run lint",
        "npm run lint:fix"
      ]
    },
    {
      "name": "typecheck",
      "description": "Run TypeScript compiler without emitting",
      "category": "cli",
      "examples": ["npm run typecheck"]
    }
  ]
}
```

### Database Tools

```json
// Tool: memory_tool
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "entries": [
    {
      "name": "db-migrate",
      "description": "Run database migrations",
      "category": "cli",
      "examples": [
        "npm run migrate:up",
        "npm run migrate:down",
        "npm run migrate:status"
      ]
    },
    {
      "name": "db-seed",
      "description": "Seed database with test data",
      "category": "cli",
      "examples": ["npm run seed"],
      "constraints": "Only run in development/test environments"
    },
    {
      "name": "db-reset",
      "description": "Drop all tables and re-run migrations",
      "category": "cli",
      "examples": ["npm run db:reset"],
      "constraints": "DESTRUCTIVE - never run in production"
    }
  ]
}
```

### Deployment Tools

```json
// Tool: memory_tool
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "entries": [
    {
      "name": "deploy-staging",
      "description": "Deploy to staging environment",
      "category": "cli",
      "examples": ["npm run deploy:staging"],
      "constraints": "Requires AWS credentials configured"
    },
    {
      "name": "deploy-prod",
      "description": "Deploy to production environment",
      "category": "cli",
      "examples": ["npm run deploy:prod"],
      "constraints": "Requires approval and production credentials"
    }
  ]
}
```

---

## Project Knowledge Base

### Codebase Structure

```json
// Tool: memory_knowledge
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "title": "Codebase Structure",
  "content": "src/ has api/, services/, models/, utils/, config/, types/. tests/ has unit/, integration/, fixtures/.",
  "category": "fact"
}
```

### Third-Party Services

```json
// Tool: memory_knowledge
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "entries": [
    {
      "title": "Email Service: SendGrid",
      "content": "Using SendGrid for transactional emails.\n- API Key in: SENDGRID_API_KEY\n- Templates managed in SendGrid dashboard\n- Wrapper in: src/services/email.ts",
      "category": "fact"
    },
    {
      "title": "Payment Processing: Stripe",
      "content": "Using Stripe for payments.\n- Keys: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET\n- Webhook endpoint: /api/webhooks/stripe\n- Service in: src/services/payments.ts",
      "category": "fact"
    },
    {
      "title": "File Storage: AWS S3",
      "content": "Using S3 for file uploads.\n- Bucket: project-uploads-prod\n- Region: us-east-1\n- Service in: src/services/storage.ts",
      "category": "fact"
    }
  ]
}
```

### Common Gotchas

```json
// Tool: memory_knowledge
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "entries": [
    {
      "title": "Gotcha: Date Timezone Handling",
      "content": "All dates are stored in UTC in the database. Always use dayjs.utc() when creating dates. Frontend converts to local timezone for display.",
      "category": "context"
    },
    {
      "title": "Gotcha: Soft Deletes",
      "content": "User and Order models use soft deletes (deletedAt column). Use model.destroy() to set deletedAt. Queries filter deleted records unless paranoid:false.",
      "category": "context"
    },
    {
      "title": "Gotcha: Transaction Handling",
      "content": "Service methods that modify multiple tables MUST use transactions. Use the withTransaction wrapper from src/utils/db.ts.",
      "category": "context"
    }
  ]
}
```

---

## API Documentation

### API Endpoints Knowledge

```json
// Tool: memory_tool
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "entries": [
    {
      "name": "POST /api/v1/auth/login",
      "description": "Authenticate user and return tokens",
      "category": "api",
      "parameters": {
        "type": "object",
        "properties": {
          "email": { "type": "string", "format": "email" },
          "password": { "type": "string", "minLength": 8 }
        },
        "required": ["email", "password"]
      },
      "examples": [
        "curl -X POST /api/v1/auth/login -d '{\"email\":\"user@example.com\",\"password\":\"...\"}'",
        "Returns: { accessToken, refreshToken, user }"
      ]
    },
    {
      "name": "GET /api/v1/users/:id",
      "description": "Get user by ID. Requires authentication.",
      "category": "api",
      "constraints": "User can only access their own profile unless admin"
    },
    {
      "name": "POST /api/v1/orders",
      "description": "Create new order. Requires authentication.",
      "category": "api",
      "parameters": {
        "type": "object",
        "properties": {
          "items": { "type": "array" },
          "shippingAddress": { "type": "object" }
        }
      }
    }
  ]
}
```

---

## Querying Examples

### Find All Security Guidelines

```json
// Tool: memory_query
{
  "action": "search",
  "types": ["guidelines"],
  "tags": {
    "include": ["security"]
  },
  "scope": {
    "type": "project",
    "inherit": true
  }
}
```

### Find Authentication-Related Knowledge

```json
// Tool: memory_query
{
  "action": "search",
  "search": "authentication JWT token",
  "types": ["knowledge", "guidelines"],
  "semanticSearch": true,
  "semanticThreshold": 0.7
}
```

### Get High-Priority Guidelines

```json
// Tool: memory_query
{
  "action": "search",
  "types": ["guidelines"],
  "priority": {
    "min": 90,
    "max": 100
  },
  "scope": {
    "type": "project",
    "inherit": true
  }
}
```

### Find CLI Commands

```json
// Tool: memory_query
{
  "action": "search",
  "types": ["tools"],
  "tags": {
    "include": ["cli"]
  }
}
```

---

## See Also

- [Workflows Guide](workflows.md) - Common workflow patterns
- [API Reference](../api-reference.md) - Complete tool documentation
- [Getting Started](../getting-started.md) - First workflow walkthrough
