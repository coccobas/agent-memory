# Contributing to Agent Memory

Thank you for your interest in contributing to Agent Memory! This document provides guidelines and information to help you contribute effectively.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the best outcome for the project
- Show empathy toward other contributors

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a branch** for your changes: `git checkout -b feature/my-feature`
4. **Make your changes** following our guidelines
5. **Test your changes** thoroughly
6. **Submit a pull request**

## Development Setup

See [Development Guide](./guides/development.md) for detailed setup instructions.

Quick start:
```bash
npm install
npm run build
npm test
```

## What to Contribute

### Good First Issues

Look for issues labeled `good-first-issue` - these are great for newcomers!

### Areas We Welcome Contributions

- **Bug fixes** - Help us squash bugs
- **Documentation** - Improve or expand documentation
- **Tests** - Increase test coverage
- **Performance** - Optimize queries or caching
- **Examples** - Add example workflows or use cases
- **Features** - Propose and implement new features (discuss first!)

## Contribution Guidelines

### Before You Start

For **major changes** (new features, breaking changes):
1. Open an issue to discuss your proposal
2. Wait for maintainer feedback
3. Get approval before starting work

For **minor changes** (bug fixes, docs, small improvements):
- You can start work right away
- Reference the issue number in your PR

### Code Quality Standards

#### Required Checks

All PRs must pass:
- ✅ Linting: `npm run lint`
- ✅ Formatting: `npm run format:check`
- ✅ Type checking: `npm run typecheck`
- ✅ Tests: `npm run test:run`
- ✅ Build: `npm run build`

Run all checks at once:
```bash
npm run validate
```

#### Code Style

- Follow the existing code style
- Use TypeScript strict mode
- Add JSDoc comments to public APIs
- Write descriptive variable and function names
- Keep functions small and focused

#### Testing

- Add tests for new features
- Maintain or improve test coverage (current: 80%, see [Test Coverage](./guides/development.md#test-coverage) for details)
- Test edge cases and error conditions
- Integration tests for MCP tool handlers
- Unit tests for repositories and services

Example test:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, createTestTool } from '../fixtures/test-helpers.js';

describe('Feature: Tool Management', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('should create a tool with initial version', () => {
    const tool = createTestTool(db, 'test-tool');
    expect(tool.name).toBe('test-tool');
    expect(tool.isActive).toBe(true);
  });
});
```

### Commit Messages

Use clear, descriptive commit messages:

**Good:**
```
Add file lock timeout validation

- Validate lock timeout is between 0 and max value
- Add test for timeout validation
- Update error messages to be more descriptive
```

**Bad:**
```
fix bug
update code
```

Format:
```
<type>: <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Pull Request Process

1. **Update documentation** if you're changing functionality
2. **Add tests** for new code
3. **Run `npm run validate`** before submitting
4. **Fill out the PR template** (if provided)
5. **Link related issues** using "Fixes #123" or "Relates to #456"
6. **Respond to feedback** promptly and professionally

### PR Title Format

```
<type>: <short description>
```

Examples:
- `feat: add search functionality to memory_query`
- `fix: resolve database lock timeout issue`
- `docs: improve getting started guide`
- `test: add integration tests for file locks`

## Specific Contribution Areas

### Adding a New MCP Tool

1. Define the tool in `src/mcp/server.ts` in the `TOOLS` array
2. Create handler in `src/mcp/handlers/` or add to existing handler
3. Add repository methods if needed in `src/db/repositories/`
4. Add integration tests in `tests/integration/`
5. Document in `docs/api-reference.md`

### Modifying the Schema

1. Update `src/db/schema.ts`
2. Generate migration: `npm run db:generate`
3. Review the generated SQL in `src/db/migrations/`
4. Test migration on a fresh database
5. Update repository methods as needed
6. Add tests for the changes

### Adding Documentation

- Use clear, concise language
- Include code examples
- Add to the appropriate doc file in `docs/`
- Update the README if needed
- Check for broken links

### Improving Performance

1. Identify the bottleneck (use `AGENT_MEMORY_PERF=1`)
2. Write a benchmark or performance test
3. Implement the optimization
4. Measure the improvement
5. Document the change in the architecture docs

## Review Process

1. **Automated checks** run on all PRs (CI)
2. **Maintainer review** - usually within 2-3 days
3. **Feedback** - address any requested changes
4. **Approval** - once approved, your PR will be merged
5. **Release** - included in the next release

## Recognition

Contributors are recognized in:
- GitHub's contributors list
- Release notes for significant contributions
- Project documentation (for major features)

## Questions?

- Open an issue with the `question` label
- Check existing documentation first
- Be specific about what you need help with

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for making Agent Memory better! 🎉
