/**
 * REST API Middleware
 *
 * Exports all middleware modules for the REST API server.
 */

export {
  registerRequestIdHook,
  registerRateLimitHeadersHook,
  registerContentTypeValidationHook,
  registerAuthHook,
  registerAuthMiddleware,
} from './auth.js';

export { registerCsrfProtection, type CsrfConfig } from './csrf.js';
