/**
 * Status handler - Check extraction service availability
 */

import { getExtractionService } from '../../../services/extraction.service.js';

/**
 * Get extraction service status
 */
export function status() {
  const service = getExtractionService();
  return {
    available: service.isAvailable(),
    provider: service.getProvider(),
    configured: service.getProvider() !== 'disabled',
  };
}
