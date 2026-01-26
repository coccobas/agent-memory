export type { IDEConversationReader, IDEMessage, IDESession, SupportedIDE } from './types.js';
export type { ImportResult, IDEConversationImporter } from './importer.js';
export type { TranscriptImportResult, TranscriptService } from './transcript-service.js';

export { OpenCodeReader, createOpenCodeReader } from './opencode-reader.js';
export { createIDEConversationImporter } from './importer.js';
export { createTranscriptService } from './transcript-service.js';

import type { IDEConversationReader, SupportedIDE } from './types.js';
import { createOpenCodeReader } from './opencode-reader.js';

export function createIDEReader(ide: SupportedIDE): IDEConversationReader {
  switch (ide) {
    case 'opencode':
      return createOpenCodeReader();
    case 'claude':
      throw new Error('Claude Code reader not yet implemented');
  }
}

export async function detectAvailableIDEs(): Promise<SupportedIDE[]> {
  const available: SupportedIDE[] = [];

  const opencode = createOpenCodeReader();
  if (await opencode.isAvailable()) {
    available.push('opencode');
  }

  return available;
}
