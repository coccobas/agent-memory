# Contract Tests

Contract tests verify that the API contracts between components remain stable.
Unlike integration tests, contract tests focus on interface stability rather than behavior.

## Directory Structure

```
tests/contract/
├── README.md          # This file
├── rest/              # REST API contract tests
│   └── health.contract.test.ts
└── mcp/               # MCP tool handler contract tests
    └── query.contract.test.ts
```

## What Contract Tests Verify

1. **Response Shape**: Ensure API responses have the expected structure
2. **Required Fields**: Verify required fields are always present
3. **Type Stability**: Ensure field types don't change unexpectedly
4. **Error Codes**: Verify error response formats are consistent

## When to Add Contract Tests

Add contract tests when:

- Adding a new public API endpoint
- Changing the response structure of an existing endpoint
- Adding or modifying MCP tool handlers
- Changing error response formats

## Running Contract Tests

```bash
# Run all contract tests
npm test -- tests/contract/

# Run REST API contracts only
npm test -- tests/contract/rest/

# Run MCP contracts only
npm test -- tests/contract/mcp/
```

## Writing Contract Tests

Contract tests should be lightweight and focus on structure, not behavior:

```typescript
describe('GET /health', () => {
  it('returns expected contract shape', async () => {
    const response = await request.get('/health');

    // Verify structure, not values
    expect(response.body).toMatchObject({
      ok: expect.any(Boolean),
      uptimeSec: expect.any(Number),
    });
  });
});
```
