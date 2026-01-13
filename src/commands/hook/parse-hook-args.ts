import { HookCliError } from './cli-error.js';

export function parseHookArgs(argv: string[]): {
  subcommand: string;
  projectId?: string;
  agentId?: string;
  autoExtract?: boolean;
  autoContext?: boolean;
} {
  const subcommand = argv[0] || '';
  let projectId: string | undefined;
  let agentId: string | undefined;
  let autoExtract: boolean | undefined;
  let autoContext: boolean | undefined;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--project-id' || arg === '--project') {
      // Bug #347 fix: Check bounds before incrementing
      if (i + 1 >= argv.length) {
        throw new HookCliError(2, `Missing value for ${arg}`);
      }
      projectId = argv[++i] ?? '';
    } else if (arg.startsWith('--project-id=') || arg.startsWith('--project=')) {
      // Bug #349 fix: Validate split result before use
      const value = arg.split('=')[1];
      if (!value) {
        throw new HookCliError(2, `Missing value for ${arg.split('=')[0]}`);
      }
      projectId = value;
    } else if (arg === '--agent-id' || arg === '--agent') {
      // Bug #347 fix: Check bounds before incrementing
      if (i + 1 >= argv.length) {
        throw new HookCliError(2, `Missing value for ${arg}`);
      }
      agentId = argv[++i] ?? '';
    } else if (arg.startsWith('--agent-id=') || arg.startsWith('--agent=')) {
      // Bug #349 fix: Validate split result before use
      const value = arg.split('=')[1];
      if (!value) {
        throw new HookCliError(2, `Missing value for ${arg.split('=')[0]}`);
      }
      agentId = value;
    } else if (arg === '--auto-extract') {
      autoExtract = true;
    } else if (arg === '--auto-context') {
      autoContext = true;
    } else if (arg.startsWith('-')) {
      throw new HookCliError(2, `Unknown option: ${arg}`);
    }
  }

  return { subcommand, projectId, agentId, autoExtract, autoContext };
}
