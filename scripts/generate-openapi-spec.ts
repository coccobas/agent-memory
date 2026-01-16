#!/usr/bin/env tsx
/**
 * Generate OpenAPI Specification
 *
 * Generates the OpenAPI 3.0 spec from MCP tool descriptors
 * and writes it to a JSON file.
 *
 * Usage:
 *   npm run generate:openapi
 *   tsx scripts/generate-openapi-spec.ts
 *   tsx scripts/generate-openapi-spec.ts --output custom-path.json
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { generateOpenAPISpec } from '../src/restapi/openapi/generator.js';

// Parse command line arguments
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const defaultOutput = resolve(process.cwd(), 'openapi.json');
const outputPath =
  outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : defaultOutput;

try {
  console.log('Generating OpenAPI specification...');

  const spec = generateOpenAPISpec();

  const json = JSON.stringify(spec, null, 2);

  writeFileSync(outputPath, json, 'utf-8');

  console.log(`✓ OpenAPI spec written to: ${outputPath}`);
  console.log(`  Version: ${spec.info.version}`);
  console.log(`  Tools: ${Object.keys(spec.paths).length - 2} (excluding meta endpoints)`);
  console.log(`  Tags: ${spec.tags?.length || 0}`);

  process.exit(0);
} catch (error) {
  console.error('✗ Failed to generate OpenAPI spec:', error);
  process.exit(1);
}
