export type ServerMode = 'mcp' | 'rest' | 'both';

export function parseServerMode(argv: string[], envModeRaw?: string): ServerMode {
  const envMode = (envModeRaw || '').toLowerCase();
  const argMode = argv
    .map((a) => a.toLowerCase())
    .find(
      (a) =>
        a === '--mcp' ||
        a === '--rest' ||
        a === '--both' ||
        a === 'mcp' ||
        a === 'rest' ||
        a === 'both' ||
        a.startsWith('--mode=')
    );

  const modeFromArg = argMode?.startsWith('--mode=') ? argMode.slice('--mode='.length) : argMode;
  const mode = modeFromArg || envMode || 'mcp';

  if (mode === '--mcp' || mode === 'mcp') return 'mcp';
  if (mode === '--rest' || mode === 'rest') return 'rest';
  if (mode === '--both' || mode === 'both') return 'both';

  throw new Error(`Unknown mode: ${mode}. Use --mcp, --rest, --both, or AGENT_MEMORY_MODE.`);
}

