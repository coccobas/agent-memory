/**
 * OpenAPI Schema Generation
 *
 * Exports OpenAPI 3.0 schema converter and generator
 */

export {
  paramSchemaToOpenAPI,
  paramSchemasToProperties,
  descriptorToOpenAPIPath,
  getStandardResponses,
  type OpenAPISchema,
  type OpenAPIParameter,
  type OpenAPIRequestBody,
  type OpenAPIResponse,
  type OpenAPIOperation,
  type OpenAPIPathItem,
} from './schema-converter.js';

export { generateOpenAPISpec, type OpenAPISpec } from './generator.js';
