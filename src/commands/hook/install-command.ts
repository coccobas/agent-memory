import { resolve } from 'node:path';

import {
  generateHooks,
  installHooks,
  getHookStatus,
  uninstallHooks,
  type SupportedIDE,
} from '../../services/hook-generator.service.js';

export type HookInstallCliResult = {
  exitCode: number;
  stdout: string[];
  stderr: string[];
};

type InstallSubcommand = 'install' | 'status' | 'uninstall';

type InstallOptions = {
  subcommand: InstallSubcommand;
  ide: SupportedIDE;
  projectPath: string;
  projectId?: string;
  sessionId?: string;
  dryRun: boolean;
  quiet: boolean;
};

type ArgError = { exitCode: number; message: string };

function parseInstallArgs(argv: string[]): InstallOptions | ArgError {
  const sub = (argv[0] || '').toLowerCase();
  if (sub !== 'install' && sub !== 'status' && sub !== 'uninstall') {
    return { exitCode: 2, message: `Unknown hook subcommand: ${argv[0] || ''}` };
  }

  const options: InstallOptions = {
    subcommand: sub,
    ide: 'claude',
    projectPath: process.cwd(),
    projectId: undefined,
    sessionId: undefined,
    dryRun: false,
    quiet: false,
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i] ?? '';

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { exitCode: 0, message: '__PRINT_HELP__' };
    }

    if (arg === '--ide') {
      const ide = (argv[++i] ?? '').toLowerCase();
      if (ide === 'claude' || ide === 'cursor' || ide === 'vscode') {
        options.ide = ide;
      } else {
        return { exitCode: 2, message: `Invalid IDE: ${ide}. Supported: claude, cursor, vscode` };
      }
      continue;
    }

    if (arg.startsWith('--ide=')) {
      const ide = arg.slice('--ide='.length).toLowerCase();
      if (ide === 'claude' || ide === 'cursor' || ide === 'vscode') {
        options.ide = ide;
      } else {
        return { exitCode: 2, message: `Invalid IDE: ${ide}. Supported: claude, cursor, vscode` };
      }
      continue;
    }

    if (arg === '--project-path') {
      options.projectPath = resolve(argv[++i] ?? process.cwd());
      continue;
    }

    if (arg.startsWith('--project-path=')) {
      options.projectPath = resolve(arg.slice('--project-path='.length));
      continue;
    }

    if (arg === '--project-id') {
      options.projectId = argv[++i] ?? '';
      continue;
    }

    if (arg.startsWith('--project-id=')) {
      options.projectId = arg.slice('--project-id='.length);
      continue;
    }

    if (arg === '--session-id') {
      options.sessionId = argv[++i] ?? '';
      continue;
    }

    if (arg.startsWith('--session-id=')) {
      options.sessionId = arg.slice('--session-id='.length);
      continue;
    }

    if (arg.startsWith('-')) {
      return { exitCode: 2, message: `Unknown option: ${arg}` };
    }
  }

  return options;
}

export function runHookInstallCommand(
  argv: string[],
  opts: { helpText: string }
): HookInstallCliResult {
  const parsed = parseInstallArgs(argv);
  if ('exitCode' in parsed) {
    if (parsed.message === '__PRINT_HELP__') {
      return { exitCode: parsed.exitCode, stdout: [opts.helpText], stderr: [] };
    }
    return { exitCode: parsed.exitCode, stdout: [], stderr: [parsed.message] };
  }

  const { subcommand, ide, projectPath, projectId, sessionId, dryRun, quiet } = parsed;
  const stdout: string[] = [];
  const stderr: string[] = [];

  const out = (s: string) => {
    if (!quiet) stdout.push(s);
  };
  const err = (s: string) => {
    if (!quiet) stderr.push(s);
  };

  if (subcommand === 'status') {
    const status = getHookStatus(projectPath, ide);
    out(`Status: ${status.installed ? 'Installed' : 'Not installed'}`);
    out('Files:');
    for (const file of status.files) {
      out(`  ${file.exists ? '✓' : '✗'} ${file.path}`);
    }
    return { exitCode: status.installed ? 0 : 1, stdout, stderr };
  }

  if (subcommand === 'uninstall') {
    if (dryRun) {
      const status = getHookStatus(projectPath, ide);
      out('(Dry run - no files will be removed)');
      out('Would remove:');
      for (const file of status.files) {
        if (file.exists) out(`  - ${file.path}`);
      }
      return { exitCode: 0, stdout, stderr };
    }

    const result = uninstallHooks(projectPath, ide);
    if (result.success) {
      out(`Removed ${result.removed.length} file(s):`);
      for (const file of result.removed) out(`  - ${file}`);
    } else {
      out('Uninstall completed with errors:');
      for (const e of result.errors) out(`  - ${e}`);
    }
    return { exitCode: result.success ? 0 : 1, stdout, stderr };
  }

  const genResult = generateHooks({ ide, projectPath, projectId, sessionId });
  if (!genResult.success) {
    err(genResult.message);
    return { exitCode: 1, stdout, stderr };
  }

  out(genResult.message);

  if (dryRun) {
    out('(Dry run - no files will be written)');
    out('Would install:');
    for (const hook of genResult.hooks) out(`  - ${hook.filePath}`);
    return { exitCode: 0, stdout, stderr };
  }

  const installResult = installHooks(genResult.hooks);
  if (installResult.success) {
    out(`Installed ${installResult.installed.length} file(s):`);
    for (const file of installResult.installed) out(`  ✓ ${file}`);
    const firstHook = genResult.hooks[0];
    if (firstHook) {
      out('---');
      out(firstHook.instructions);
    }
  } else {
    out('Installation completed with errors:');
    for (const e of installResult.errors) out(`  ✗ ${e}`);
    for (const file of installResult.installed) out(`  ✓ ${file}`);
  }

  return { exitCode: installResult.success ? 0 : 1, stdout, stderr };
}

