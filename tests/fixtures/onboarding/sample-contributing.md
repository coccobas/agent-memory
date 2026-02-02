# Contributing to Sample Project

## Branch Strategy

We follow a trunk-based development model with feature branches:

- **main**: Production-ready code, always deployable
- **develop**: Integration branch for features
- **feature/\***: Individual feature branches off develop
- **bugfix/\***: Bug fix branches off develop
- **hotfix/\***: Critical fixes off main, merged back to main and develop

### Branch Naming

- `feature/user-authentication` - New features
- `bugfix/login-redirect` - Bug fixes
- `hotfix/security-patch` - Critical production fixes
- `docs/api-reference` - Documentation updates

## Pull Request Process

1. Create a feature branch from `develop`
2. Make your changes and commit with clear messages
3. Push to your fork and open a pull request
4. Ensure all tests pass and coverage is maintained
5. Request review from at least one maintainer
6. Address feedback and update your PR
7. Squash commits before merging (one commit per feature)
8. Merge to `develop` using "Squash and merge"

### PR Title Format

```
[type]: Brief description

Types: feat, fix, docs, style, refactor, test, chore
```

Example: `feat: Add semantic search to market discovery`

## Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Format with Prettier
- Write tests for all new features
- Maintain 80%+ code coverage

## Testing Requirements

- Unit tests for all functions
- Integration tests for API endpoints
- E2E tests for critical user flows
- Run `npm test` before pushing

## Commit Messages

Follow conventional commits:

```
type(scope): subject

body

footer
```

Example:

```
feat(auth): Add JWT token refresh mechanism

Implement automatic token refresh when tokens expire.
Tokens are refreshed 5 minutes before expiration.

Closes #123
```
