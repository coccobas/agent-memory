/**
 * Key CLI Command
 *
 * Generate secure API keys for authentication.
 */

import { randomBytes } from 'node:crypto';
import type { Command } from 'commander';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { typedAction } from '../utils/typed-action.js';

interface KeyGenerateOptions extends Record<string, unknown> {
  bytes?: string;
  encoding?: string;
  count?: string;
  forAgent?: string;
}

/**
 * Generate a cryptographically secure API key.
 *
 * @param bytes - Number of random bytes (default: 32 = 256 bits)
 * @param encoding - Output encoding: base64url, base64, or hex (default: base64url)
 */
function generateApiKey(bytes = 32, encoding: 'base64url' | 'base64' | 'hex' = 'base64url'): string {
  const buffer = randomBytes(bytes);
  if (encoding === 'base64url') {
    return buffer.toString('base64url');
  }
  return buffer.toString(encoding);
}

export function addKeyCommand(program: Command): void {
  const keyCmd = program.command('key').description('API key management');

  keyCmd
    .command('generate')
    .description('Generate a secure API key')
    .option('-b, --bytes <n>', 'Number of random bytes (default: 32 = 256 bits)', '32')
    .option(
      '-e, --encoding <type>',
      'Output encoding: base64url, base64, or hex (default: base64url)',
      'base64url'
    )
    .option('-c, --count <n>', 'Number of keys to generate', '1')
    .option('-a, --for-agent <id>', 'Agent ID to associate with the key (for multi-key config output)')
    .action(
      typedAction<KeyGenerateOptions>(async (options, globalOpts) => {
        const bytes = parseInt(options.bytes ?? '32', 10);
        const encoding = (options.encoding ?? 'base64url') as 'base64url' | 'base64' | 'hex';
        const count = parseInt(options.count ?? '1', 10);
        const forAgent = options.forAgent;

        if (bytes < 16) {
          console.error('Error: Minimum 16 bytes (128 bits) required for security');
          process.exit(1);
        }

        if (bytes > 64) {
          console.error('Error: Maximum 64 bytes (512 bits) supported');
          process.exit(1);
        }

        if (!['base64url', 'base64', 'hex'].includes(encoding)) {
          console.error('Error: Encoding must be base64url, base64, or hex');
          process.exit(1);
        }

        if (count < 1 || count > 10) {
          console.error('Error: Count must be between 1 and 10');
          process.exit(1);
        }

        const keys = Array.from({ length: count }, () => generateApiKey(bytes, encoding));

        const format = globalOpts.format as OutputFormat;

        if (format === 'json') {
          const result = keys.map((key) => ({
            key,
            ...(forAgent ? { agentId: forAgent } : {}),
            bytes,
            encoding,
            bits: bytes * 8,
          }));
          console.log(formatOutput(count === 1 ? result[0] : result, format));
        } else {
          // Table/text format
          if (forAgent) {
            console.log('\n# Add to AGENT_MEMORY_REST_API_KEYS (JSON format):');
            const jsonConfig = keys.map((key) => ({ key, agentId: forAgent }));
            console.log(`export AGENT_MEMORY_REST_API_KEYS='${JSON.stringify(jsonConfig)}'`);
            console.log('\n# Or single key:');
            console.log(`export AGENT_MEMORY_API_KEY="${keys[0]}"`);
          } else {
            console.log('\n# Generated API key(s):');
            for (const key of keys) {
              console.log(key);
            }
            console.log('\n# Set as environment variable:');
            console.log(`export AGENT_MEMORY_API_KEY="${keys[0]}"`);
          }
          console.log(`\n# Key strength: ${bytes * 8} bits (${bytes} bytes, ${encoding} encoded)`);
        }
      })
    );
}
