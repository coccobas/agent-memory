# Contributing

Thanks for contributing to Agent Memory!

## Quick Start

```bash
# Clone and install
git clone https://github.com/anthropics/agent-memory.git
cd agent-memory
npm install
npm run build
```

## Quality Gates

Before opening a PR, run:

```bash
npm run validate
```

This runs:
- TypeScript type checking
- ESLint
- Prettier formatting
- Test suite

## Development Workflow

1. Create a feature branch
2. Make your changes
3. Run `npm run validate`
4. Open a pull request

See [Development Guide](development.md) for detailed setup.

## Code Style

- TypeScript strict mode is enforced
- Follow existing patterns in `src/services` and `src/mcp`
- Add tests for new behavior
- Update documentation for user-facing changes

## Testing

```bash
# Run all tests
npm run test:run

# Run specific test file
npm run test:run -- tests/unit/query.service.test.ts

# Watch mode
npm run test
```

See [Testing Guide](testing.md) for test patterns.

## Documentation

When adding features:
- Update relevant docs in `docs/`
- Run `npm run docs:generate:env` if adding env vars
- Add changelog entry

## Security

If you find a security vulnerability, please report it privately via GitHub Security Advisories rather than opening a public issue.

## Getting Help

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Provide reproduction steps for bugs
