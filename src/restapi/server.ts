/**
 * REST API Server — V2 Shim
 *
 * Minimal HTTP server that translates v1 dashboard tool calls
 * (POST /v1/tools/:name) into v2 handler invocations.
 * Uses Node `http` module — no new dependencies.
 */

import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppContext, shutdownAppContext } from '../core/factory.js';
import { config } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';
import { getUnifiedAuthConfig } from '../config/auth.js';
import type { AppContext } from '../core/context.js';
import { dispatchV1Tool } from './v2-compat.js';

const logger = createComponentLogger('rest');

const MAX_BODY_BYTES = config.rest.bodyLimit;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('body_too_large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Static file serving (dashboard)
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function resolveDashboardDir(): string | null {
  const configured = config.rest.dashboardPath;
  if (configured) {
    return existsSync(configured) ? configured : null;
  }

  // Auto-detect: look for dashboard/dist relative to package root.
  // At runtime, this file is at dist/restapi/server.js, so go up 2 levels.
  const __filename = fileURLToPath(import.meta.url);
  const packageRoot = resolve(dirname(__filename), '..', '..');
  const autoPath = join(packageRoot, 'dashboard', 'dist');
  return existsSync(autoPath) ? autoPath : null;
}

function tryServeStatic(dashboardDir: string, req: IncomingMessage, res: ServerResponse): boolean {
  const urlPath = (req.url ?? '/').split('?')[0] ?? '/';

  // Never intercept API routes
  if (urlPath.startsWith('/v1/')) {
    return false;
  }

  // Try exact file match first
  const filePath = join(dashboardDir, urlPath);
  const normalizedFilePath = resolve(filePath);

  // Prevent path traversal
  if (!normalizedFilePath.startsWith(resolve(dashboardDir))) {
    return false;
  }

  if (existsSync(normalizedFilePath) && statSync(normalizedFilePath).isFile()) {
    const ext = extname(normalizedFilePath);
    const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
    const content = readFileSync(normalizedFilePath);
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(content);
    return true;
  }

  // SPA fallback: serve index.html for non-file routes
  const indexPath = join(dashboardDir, 'index.html');
  if (existsSync(indexPath)) {
    const content = readFileSync(indexPath);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(content);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Tool name extraction
// ---------------------------------------------------------------------------

function extractToolName(url: string): string | null {
  const path = url.split('?')[0] ?? '';
  const match = /^\/v1\/tools\/([a-z_]+)$/i.exec(path);
  return match?.[1] ?? null;
}

function checkAuth(req: IncomingMessage): boolean {
  const authConfig = getUnifiedAuthConfig();

  if (authConfig.devModeEnabled || !authConfig.apiKey) {
    return true;
  }

  const header = req.headers.authorization;
  if (!header) return false;

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return false;

  return token === authConfig.apiKey;
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleRequest(
  context: AppContext,
  dashboardDir: string | null,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve dashboard static files for GET requests
  if (req.method === 'GET' && dashboardDir) {
    if (tryServeStatic(dashboardDir, req, res)) {
      return;
    }
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
    return;
  }

  if (!checkAuth(req)) {
    sendJson(res, 401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return;
  }

  const toolName = extractToolName(req.url ?? '');
  if (!toolName) {
    sendJson(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
    return;
  }

  let params: Record<string, unknown>;
  try {
    const raw = await readBody(req);
    params = raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch (error) {
    const message =
      error instanceof Error && error.message === 'body_too_large'
        ? 'Request body too large'
        : 'Invalid JSON body';
    sendJson(res, 400, { error: message, code: 'INVALID_BODY' });
    return;
  }

  try {
    const result = await dispatchV1Tool(context, toolName, params);
    sendJson(res, 200, { success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ tool: toolName, error: message }, 'Tool dispatch error');
    sendJson(res, 500, {
      success: false,
      error: { message, code: 'TOOL_ERROR' },
    });
  }
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

export async function runServer(
  options: { runtime?: unknown; manageProcess?: boolean } = {}
): Promise<void> {
  const shouldExitProcess = options.manageProcess ?? true;

  logger.info('Starting REST API server...');

  const context = await createAppContext(config);
  const host = config.rest.host;
  const port = config.rest.port;
  const dashboardDir = resolveDashboardDir();

  if (dashboardDir) {
    logger.info({ dashboardDir }, 'Dashboard UI will be served at /');
  } else {
    logger.info('No dashboard dist found — API-only mode');
  }

  const server = createHttpServer((req, res) => {
    handleRequest(context, dashboardDir, req, res).catch((error: unknown) => {
      logger.error({ error }, 'Unhandled request error');
      if (!res.headersSent) {
        sendJson(res, 500, { success: false, error: { message: 'Internal server error' } });
      }
    });
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down REST server');
    server.close();
    await shutdownAppContext(context);
    if (context.sqlite) {
      try {
        context.sqlite.close();
      } catch {
        /* ignore */
      }
    }
    logger.info('REST server shutdown complete');
    if (shouldExitProcess) {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  server.listen(port, host, () => {
    logger.info({ host, port }, `REST API server listening on http://${host}:${port}`);
  });
}
