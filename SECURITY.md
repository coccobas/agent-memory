# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.9.x   | :white_check_mark: |
| < 0.9   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability within agent-memory, please report it responsibly:

1. **Email**: Send details to [security@anthropic.com](mailto:security@anthropic.com)
2. **Subject line**: Include "agent-memory security vulnerability" in the subject
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact assessment
   - Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your report within 48 hours
- **Initial Assessment**: Within 7 days, we will provide an initial assessment
- **Resolution Timeline**: We aim to resolve critical vulnerabilities within 30 days
- **Disclosure**: We coordinate disclosure timing with reporters

### Security Bug Bounty

We do not currently offer a formal bug bounty program, but we deeply appreciate security researchers who responsibly disclose vulnerabilities.

## Security Measures

agent-memory implements several security measures:

### Authentication & Authorization

- **API Key Authentication**: HMAC-indexed O(1) lookup with timing-safe verification
- **Multi-tier Rate Limiting**: Burst, global, and per-agent rate limiters
- **Permission System**: Scoped permissions (global, org, project, session)
- **Admin Key Requirement**: Privileged operations require admin authentication

### Data Protection

- **No Raw SQL**: All database operations use Drizzle ORM with parameterized queries
- **Input Validation**: Type guards and runtime validation on all inputs
- **Error Sanitization**: Production errors redact file paths, IPs, and sensitive data
- **Sensitive Data Masking**: 50+ API key patterns automatically masked in logs

### Web Security (REST API)

- **CSRF Protection**: Double-submit cookie pattern with SameSite=strict
- **CORS Configuration**: Explicit origin whitelisting required
- **Security Headers**: Helmet middleware for HTTP security headers
- **Request Validation**: All inputs validated before processing

### Cryptography

- **Timing-Safe Comparisons**: All sensitive comparisons use `crypto.timingSafeEqual()`
- **CSRF Tokens**: 256-bit random tokens with HMAC binding
- **API Key Hashing**: Pre-computed SHA-256 hashes for secure storage

## Configuration

### Recommended Production Settings

```bash
# Required for production
AGENT_MEMORY_API_KEY=<strong-random-key>

# CSRF protection (minimum 32 characters)
AGENT_MEMORY_CSRF_SECRET=<strong-random-secret>

# Disable dev mode
AGENT_MEMORY_DEV_MODE=false

# Enable rate limiting
AGENT_MEMORY_RATE_LIMIT_ENABLED=true
```

### Environment-Specific Notes

- **Development**: `AGENT_MEMORY_DEV_MODE=true` bypasses authentication (for local development only)
- **Production**: Never enable dev mode; always use strong API keys

### Production Security Blocks

Starting from v0.9.17, agent-memory implements **hard blocks** that prevent insecure configurations in production:

| Configuration                              | Behavior in Production                                       |
| ------------------------------------------ | ------------------------------------------------------------ |
| `AGENT_MEMORY_DEV_MODE=true`               | **Throws error** - dev mode cannot be enabled                |
| `AGENT_MEMORY_PERMISSIONS_MODE=permissive` | **Throws error** - permissive mode blocked                   |
| Ollama with external URLs                  | **Throws error** - SSRF protection blocks non-localhost URLs |

**Override (use with extreme caution):**

```bash
# Only if you absolutely need dev mode in production (e.g., staging environment)
AGENT_MEMORY_ALLOW_DEV_MODE_IN_PRODUCTION=true
```

This override enables both dev mode and permissive mode in production environments. **Use only for trusted staging/testing environments.**

## Known Limitations

1. **Single-tenant by default**: The permission system assumes trusted agents within the same deployment
2. **Local SQLite**: Default SQLite storage is not suitable for multi-node deployments
3. **File-based locks**: Distributed deployments require Redis for proper coordination

## Security Updates

Security updates are released as patch versions. We recommend:

1. **Subscribe to releases**: Watch the repository for release notifications
2. **Update promptly**: Apply security patches within your maintenance window
3. **Review changelogs**: Check [CHANGELOG.md](./docs/changelog.md) for security-related changes

## Security Contacts

- **General Security**: [security@anthropic.com](mailto:security@anthropic.com)
- **GitHub Issues**: For non-sensitive security discussions
