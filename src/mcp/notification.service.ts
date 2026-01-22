/**
 * Re-export notification service from utils for backward compatibility
 */
export {
  type LoggingLevel,
  setNotificationServer,
  clearNotificationServer,
  sendNotification,
  notify,
} from '../utils/notification.service.js';
