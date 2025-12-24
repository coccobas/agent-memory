/**
 * Status handler - Check extraction service availability
 *
 * Context-aware handler that receives AppContext for dependency injection.
 */

import type { AppContext } from '../../../core/context.js';

/**
 * Get extraction service status
 */
export function status(context: AppContext) {
  const service = context.services?.extraction;
  if (!service) {
    return {
      available: false,
      provider: 'disabled' as const,
      configured: false,
    };
  }
  return {
    available: service.isAvailable(),
    provider: service.getProvider(),
    configured: service.getProvider() !== 'disabled',
  };
}
