export type ServerMode = 'mcp' | 'rest' | 'both';

export function parseServerMode(argv: string[], envModeRaw?: string): ServerMode {
  const envMode = (envModeRaw || '').toLowerCase();
  const argMode = argv
    .map((a) => a.toLowerCase())
    .find(
      (a) =>
        // Full names
        a === '--mcp' ||
        a === '--rest' ||
        a === '--both' ||
        a === 'mcp' ||
        a === 'rest' ||
        a === 'both' ||
        // Short aliases
        a === '-m' ||
        a === '-r' ||
        a === '-b' ||
        a === 'm' ||
        a === 'r' ||
        a === 'b' ||
        a.startsWith('--mode=')
    );

  const modeFromArg = argMode?.startsWith('--mode=') ? argMode.slice('--mode='.length) : argMode;
  const mode = modeFromArg || envMode || 'mcp';

  // Full names
  if (mode === '--mcp' || mode === 'mcp') return 'mcp';
  if (mode === '--rest' || mode === 'rest') return 'rest';
  if (mode === '--both' || mode === 'both') return 'both';
  // Short aliases
  if (mode === '-m' || mode === 'm') return 'mcp';
  if (mode === '-r' || mode === 'r') return 'rest';
  if (mode === '-b' || mode === 'b') return 'both';

  throw new Error(
    `Unknown mode: ${mode}. Use --mcp (-m), --rest (-r), --both (-b), or AGENT_MEMORY_MODE.`
  );
}
