import type { Config } from '../config/index.js';
import { createRuntime, extractRuntimeConfig, shutdownRuntime, type Runtime } from './runtime.js';
import { getRuntime, isRuntimeRegistered, registerRuntime } from './container.js';

export interface RuntimeOwnership {
  runtime: Runtime;
  ownsRuntime: boolean;
}

export function ensureRuntime(config: Config): RuntimeOwnership {
  if (isRuntimeRegistered()) {
    return { runtime: getRuntime(), ownsRuntime: false };
  }

  const runtime = createRuntime(extractRuntimeConfig(config));
  registerRuntime(runtime);
  return { runtime, ownsRuntime: true };
}

export async function shutdownOwnedRuntime(ownsRuntime: boolean, runtime: Runtime): Promise<void> {
  if (!ownsRuntime) return;
  await shutdownRuntime(runtime);
}
