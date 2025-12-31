/**
 * Config Builder Helper Functions
 *
 * Utility functions for reading environment variables with type-safe defaults.
 * These wrap the parsers from the registry to provide a cleaner API for builders.
 */

import { parseInt_, parseNumber, parseBoolean } from '../registry/parsers.js';

/**
 * Get a floating-point number from environment variable with fallback to default.
 *
 * @param envKey - Environment variable name
 * @param defaultValue - Default value if env var is not set or invalid
 * @returns Parsed number or default value
 */
export function getEnvNumber(envKey: string, defaultValue: number): number {
  const envValue = process.env[envKey];
  if (envValue === undefined || envValue === '') {
    return defaultValue;
  }
  return parseNumber(envValue, defaultValue);
}

/**
 * Get an integer from environment variable with fallback to default.
 *
 * @param envKey - Environment variable name
 * @param defaultValue - Default value if env var is not set or invalid
 * @returns Parsed integer or default value
 */
export function getEnvInt(envKey: string, defaultValue: number): number {
  const envValue = process.env[envKey];
  if (envValue === undefined || envValue === '') {
    return defaultValue;
  }
  return parseInt_(envValue, defaultValue);
}

/**
 * Get a boolean from environment variable with fallback to default.
 * Accepts '1', 'true' (case-insensitive) as true.
 *
 * @param envKey - Environment variable name
 * @param defaultValue - Default value if env var is not set or invalid
 * @returns Parsed boolean or default value
 */
export function getEnvBoolean(envKey: string, defaultValue: boolean): boolean {
  const envValue = process.env[envKey];
  if (envValue === undefined || envValue === '') {
    return defaultValue;
  }
  return parseBoolean(envValue, defaultValue);
}
