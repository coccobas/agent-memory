# OpenAPI Schema Generation

This directory contains utilities to automatically generate OpenAPI 3.0 specifications from MCP tool descriptors.

## Overview

The OpenAPI schema is generated from the same tool descriptors that power the MCP server, ensuring consistency between MCP and REST APIs.

## Components

### schema-converter.ts
Converts MCP parameter schemas to OpenAPI 3.0 format:
- `paramSchemaToOpenAPI()` - Convert individual ParamSchema to OpenAPISchema
- `paramSchemasToProperties()` - Convert multiple parameters
- `descriptorToOpenAPIPath()` - Generate complete path and operation from tool descriptor
- `getStandardResponses()` - Standard error responses (200, 400, 401, 403, 404, 429)

### generator.ts
Generates the complete OpenAPI specification:
- `generateOpenAPISpec()` - Create full spec from all descriptors
- Includes metadata, servers, security schemes, tags
- Adds meta endpoints (list tools, OpenAPI spec endpoint)

## Usage

### Generate OpenAPI Spec

```bash
# Generate openapi.json in project root
npm run docs:generate:openapi

# Generate to custom location
npm run docs:generate:openapi -- --output path/to/spec.json

# Direct execution
npx tsx scripts/generate-openapi-spec.ts
```

### Programmatic Usage

```typescript
import { generateOpenAPISpec } from './restapi/openapi/generator.js';
import { descriptorToOpenAPIPath } from './restapi/openapi/schema-converter.js';

// Generate full spec
const spec = generateOpenAPISpec();

// Convert individual descriptor
const myDescriptor = { /* ... */ };
const { path, pathItem } = descriptorToOpenAPIPath(myDescriptor);
```

## Generated Specification

The generated spec includes:

- **OpenAPI Version**: 3.0.3
- **Info**: Title, version (from package.json), description, contact, license
- **Servers**: localhost:3100 (configurable)
- **Security Schemes**: Bearer Auth (JWT), API Key
- **Paths**:
  - `/v1/tools` - List all tools
  - `/v1/openapi.json` - Get OpenAPI spec
  - `/v1/tools/{toolName}` - Tool endpoints (POST)
- **Tags**: Organized by feature area
- **Components**: Security schemes, shared schemas

## Features

### Automatic Conversion
- MCP param schemas → OpenAPI schemas
- Action enums for action-based tools
- Common params + action-specific params merged
- Required fields tracked
- Standard error responses

### Type Safety
All conversion functions are fully typed with TypeScript interfaces matching OpenAPI 3.0 spec.

### Validation
Standard responses include error codes and examples:
- E1000-E1999: Validation errors
- E2000-E2999: Not found errors
- E3000-E3999: Conflict errors
- E4000-E4999: Business logic errors
- E5000-E5999: Database errors
- E6000-E6999: Permission errors
- E9000-E9999: Rate limiting errors

## Testing

Run unit tests:
```bash
npm test openapi-generator.test.ts
```

Tests cover:
- Schema conversion (string, number, boolean, object, array, enum)
- Descriptor to path conversion
- Action-based vs simple descriptors
- Required fields
- Security schemes
- Error responses
- Full spec generation

## Integration

The OpenAPI spec can be used with:
- Swagger UI / ReDoc for documentation
- API clients (OpenAPI Generator, openapi-typescript)
- Testing tools (Postman, Insomnia)
- API gateways and proxies

## Maintenance

When adding new MCP tools:
1. Add descriptor to `src/mcp/descriptors/`
2. Export from `src/mcp/descriptors/index.ts`
3. Regenerate spec: `npm run docs:generate:openapi`

No manual OpenAPI editing required - spec is automatically derived from descriptors.
