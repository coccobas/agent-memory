import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getMaintenanceJobManager } from '../../services/librarian/maintenance/job-manager.js';
import type {
  JobEventName,
  JobEventMap,
} from '../../services/librarian/maintenance/job-manager.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('jobs-sse');

interface SSEClient {
  id: string;
  reply: FastifyReply;
  jobId?: string;
}

const clients = new Map<string, SSEClient>();
let clientIdCounter = 0;

function formatSSEMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function broadcast(event: string, data: unknown, filterJobId?: string): void {
  const message = formatSSEMessage(event, data);
  for (const client of clients.values()) {
    if (!filterJobId || !client.jobId || client.jobId === filterJobId) {
      try {
        client.reply.raw.write(message);
      } catch {
        clients.delete(client.id);
      }
    }
  }
}

function setupJobManagerListeners(): void {
  const jobManager = getMaintenanceJobManager();

  const events: JobEventName[] = [
    'job:created',
    'job:started',
    'job:task_progress',
    'job:completed',
    'job:failed',
  ];

  for (const eventName of events) {
    jobManager.on(eventName, (data: JobEventMap[typeof eventName]) => {
      const jobId = 'job' in data ? data.job.id : 'jobId' in data ? data.jobId : undefined;
      broadcast(eventName, data, jobId);
    });
  }

  logger.info('Job manager SSE listeners registered');
}

let listenersSetup = false;

export async function registerJobsSSERoutes(app: FastifyInstance): Promise<void> {
  if (!listenersSetup) {
    setupJobManagerListeners();
    listenersSetup = true;
  }

  app.get('/v1/jobs/events', async (request: FastifyRequest, reply: FastifyReply) => {
    const jobId = (request.query as { jobId?: string }).jobId;

    void reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const clientId = `sse-${++clientIdCounter}`;
    clients.set(clientId, { id: clientId, reply, jobId });

    logger.debug({ clientId, jobId }, 'SSE client connected');

    reply.raw.write(formatSSEMessage('connected', { clientId, jobId }));

    const keepAlive = setInterval(() => {
      try {
        reply.raw.write(':keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        clients.delete(clientId);
      }
    }, 30000);

    request.raw.on('close', () => {
      clearInterval(keepAlive);
      clients.delete(clientId);
      logger.debug({ clientId }, 'SSE client disconnected');
    });

    return reply;
  });

  app.get('/v1/jobs/events/stats', async () => {
    return {
      connectedClients: clients.size,
      clients: Array.from(clients.values()).map((c) => ({
        id: c.id,
        jobId: c.jobId,
      })),
    };
  });
}
