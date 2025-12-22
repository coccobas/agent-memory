import { HookCliError } from './cli-error.js';

export function parseHookArgs(argv: string[]): {
  subcommand: string;
  projectId?: string;
  agentId?: string;
  autoExtract?: boolean;
} {
  const subcommand = argv[0] || '';
  let projectId: string | undefined;
  let agentId: string | undefined;
  let autoExtract: boolean | undefined;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--project-id' || arg === '--project') {
      projectId = argv[++i] ?? '';
    } else if (arg.startsWith('--project-id=') || arg.startsWith('--project=')) {
      projectId = arg.split('=')[1];
    } else if (arg === '--agent-id' || arg === '--agent') {
      agentId = argv[++i] ?? '';
    } else if (arg.startsWith('--agent-id=') || arg.startsWith('--agent=')) {
      agentId = arg.split('=')[1];
    } else if (arg === '--auto-extract') {
      autoExtract = true;
    } else if (arg.startsWith('-')) {
      throw new HookCliError(2, `Unknown option: ${arg}`);
    }
  }

  return { subcommand, projectId, agentId, autoExtract };
}
