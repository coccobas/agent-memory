/**
 * Agent Memory Plugin for OpenCode - Native MCP Implementation
 *
 * Uses @modelcontextprotocol/sdk for direct MCP communication
 * instead of CLI subprocess calls.
 *
 * Benefits:
 * - Single long-lived connection (no subprocess spawn per call)
 * - Native streaming support
 * - Better error handling
 * - ~5x faster per-call performance
 */
import type { Plugin } from '@opencode-ai/plugin';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  formatSuggestionsList,
  formatReviewList,
  parseSelectionTarget,
  type ReviewCandidate,
} from './utils.js';

const AM_BIN = process.env.AGENT_MEMORY_BIN ?? 'agent-memory';
const AGENT_ID = process.env.AGENT_MEMORY_AGENT_ID ?? 'opencode';
const SHOW_TOASTS = process.env.AGENT_MEMORY_SHOW_TOASTS !== 'false';

// Store context to inject into tool outputs (keyed by callID)
const pendingContextInjections = new Map<string, string>();

// Track recent errors for error-recovery pattern detection
interface ErrorContext {
  tool: string;
  message: string;
  timestamp: number;
  eventId?: string;
}
const recentErrors: ErrorContext[] = [];
const MAX_ERROR_HISTORY = 5;
const ERROR_RECOVERY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface ExtractionSuggestion {
  hash: string;
  type: string;
  title: string;
  content: string;
}
let pendingSuggestions: ExtractionSuggestion[] = [];
let pendingReviewCandidates: ReviewCandidate[] = [];

function resolveReviewTarget(target: string): string | undefined {
  const num = parseInt(target, 10);
  if (!isNaN(num) && num > 0 && num <= pendingReviewCandidates.length) {
    const candidate = pendingReviewCandidates[num - 1];
    return candidate?.id ?? candidate?.shortId;
  }
  const byId = pendingReviewCandidates.find(
    (c) => c.id === target || c.shortId === target || c.id?.startsWith(target)
  );
  return byId?.id ?? byId?.shortId;
}

interface NotificationContext {
  level: string;
  message: string;
  timestamp: number;
}
const recentNotifications: NotificationContext[] = [];
const MAX_NOTIFICATION_HISTORY = 10;

/**
 * MCP Client wrapper for agent-memory
 * Manages connection lifecycle and provides typed tool calls
 */
class AgentMemoryClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connecting: Promise<void> | null = null;
  private projectId: string | undefined;
  private activeEpisodeId: string | undefined;

  async connect(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;

    this.connecting = this._doConnect();
    await this.connecting;
    this.connecting = null;
  }

  private async _doConnect(): Promise<void> {
    this.transport = new StdioClientTransport({
      command: AM_BIN,
      args: ['mcp'],
      env: {
        ...process.env,
        LOG_LEVEL: 'error', // Suppress verbose server logs
        AGENT_MEMORY_LOG_LEVEL: 'error',
      },
    });

    this.client = new Client({ name: 'opencode', version: '1.0.0' }, { capabilities: {} });

    await this.client.connect(this.transport);

    // F6: Set up notification handler for server-pushed messages
    this.client.setNotificationHandler(async (notification) => {
      if (notification.method === 'notifications/message') {
        const params = notification.params as { level?: string; data?: string };
        const level = params?.level ?? 'info';
        const message = params?.data ?? '';

        // Track notification for analytics
        recentNotifications.push({ level, message, timestamp: Date.now() });
        if (recentNotifications.length > MAX_NOTIFICATION_HISTORY) {
          recentNotifications.shift();
        }

        // Note: Toast display would be done in plugin context, not here
        // This handler just tracks notifications for potential use
        console.log(`[agent-memory] Notification (${level}): ${message}`);
      }
    });
  }

  setProjectId(id: string | undefined) {
    this.projectId = id;
  }

  setEpisodeId(id: string | undefined) {
    this.activeEpisodeId = id;
  }

  getEpisodeId(): string | undefined {
    return this.activeEpisodeId;
  }

  async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.connect();
    if (!this.client) throw new Error('Not connected');

    // Inject projectId and agentId if available
    const enrichedArgs = {
      ...args,
      ...(this.projectId && { projectId: this.projectId }),
      agentId: AGENT_ID,
    };

    const result = await this.client.callTool({
      name,
      arguments: enrichedArgs,
    });

    // Parse result content
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: { type: string }) => c.type === 'text');
      if (textContent && 'text' in textContent) {
        try {
          return JSON.parse(textContent.text as string) as T;
        } catch {
          return textContent.text as T;
        }
      }
    }
    return result as T;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.transport = null;
    }
  }
}

export const AgentMemoryPlugin: Plugin = async ({ client, directory, worktree }) => {
  const mcpClient = new AgentMemoryClient();
  let projectId: string | undefined;

  // Helper to show toast notifications
  async function showToast(
    message: string,
    variant: 'info' | 'success' | 'warning' | 'error' = 'info'
  ) {
    if (!SHOW_TOASTS) return;
    try {
      await client.tui.showToast({
        body: { title: 'Agent Memory', message, variant, duration: 4000 },
      });
    } catch {}
  }

  async function ensureProjectId() {
    if (projectId) return projectId;
    const current = await client.project.current();
    projectId = current.data?.id;
    mcpClient.setProjectId(projectId);
    return projectId;
  }

  async function getSessionMessages(sessionId: string) {
    const response = await client.session.messages({ path: { id: sessionId } });
    const messages = response.data ?? [];
    return messages.flatMap((m) => {
      const role = m.info.role ?? 'assistant';
      const content = (m.parts ?? [])
        .map((p) => ('text' in p ? p.text : ''))
        .filter(Boolean)
        .join('\n');
      return content ? [{ role, content }] : [];
    });
  }

  function getToolInput(input: unknown, output: unknown) {
    const i = input as Record<string, unknown>;
    const o = output as Record<string, unknown>;
    return o?.args ?? i?.args ?? i?.input ?? i?.toolInput ?? i?.tool_input ?? undefined;
  }

  function getToolResponse(output: unknown) {
    const o = output as Record<string, unknown>;
    return o?.result ?? o?.output ?? o?.data ?? output;
  }

  function formatCommandResponse(command: string, response: string): string {
    return `\`${command}\`\n\n\`\`\`\n${response}\n\`\`\``;
  }

  // Helper to log errors to episode (non-blocking)
  async function logEpisodeError(message: string, data?: Record<string, unknown>) {
    const episodeId = mcpClient.getEpisodeId();
    if (!episodeId) return;

    mcpClient
      .callTool('memory_episode', {
        action: 'log',
        id: episodeId,
        message,
        eventType: 'error',
        data,
      })
      .catch(() => {});
  }

  // Helper to record an experience (learning from what happened)
  async function recordExperience(
    title: string,
    scenario: string,
    outcome: string,
    outcomeType: 'success' | 'partial' | 'failure' = 'success'
  ) {
    try {
      await mcpClient.callTool('memory_experience', {
        action: 'learn',
        text: `${title}: ${scenario} → ${outcome}`,
        outcome: outcomeType,
        scopeType: 'project',
      });
      await showToast(`📚 Learned: ${title.slice(0, 30)}...`, 'success');
    } catch (e) {
      console.error('[agent-memory] Failed to record experience:', e);
    }
  }

  // Track error for recovery detection
  function trackError(tool: string, message: string, eventId?: string) {
    recentErrors.push({ tool, message, timestamp: Date.now(), eventId });
    if (recentErrors.length > MAX_ERROR_HISTORY) {
      recentErrors.shift();
    }
  }

  // Check if recent success might be recovery from an error
  function checkErrorRecovery(tool: string): ErrorContext | undefined {
    const now = Date.now();
    const recentError = recentErrors.find(
      (e) => e.tool === tool && now - e.timestamp < ERROR_RECOVERY_WINDOW_MS
    );
    if (recentError) {
      // Remove from tracking once detected
      const idx = recentErrors.indexOf(recentError);
      if (idx > -1) recentErrors.splice(idx, 1);
    }
    return recentError;
  }

  // Detect task completion phrases
  function isTaskCompletion(text: string): boolean {
    const completionPatterns = [
      /\b(thanks|thank you|that'?s? (it|all|perfect|great)|done|works?( now)?|fixed|solved)\b/i,
      /\b(looks? good|awesome|excellent|perfect)\b/i,
      /^(ok|okay|great|nice|cool)\.?$/i,
    ];
    return completionPatterns.some((p) => p.test(text.trim()));
  }

  return {
    event: async ({ event }) => {
      // Handle session created
      if (event.type === 'session.created') {
        await ensureProjectId();
        const sessionId = event.properties?.id;
        if (!sessionId) return;

        try {
          // Call memory_quickstart to start session and get counts
          const result = await mcpClient.callTool<{
            context?: {
              summary?: { byType?: Record<string, number> };
              experiences?: Array<{ title?: string; outcome?: string }>;
            };
            session?: { success: boolean; id?: string };
            episode?: { id?: string };
          }>('memory_quickstart', {
            sessionName: `opencode-${sessionId}`,
            sessionPurpose: 'OpenCode session',
            autoEpisode: true,
          });

          // Log relevant experiences if any
          const experiences = result?.context?.experiences ?? [];
          if (experiences.length > 0) {
            const expSummary = experiences
              .slice(0, 3)
              .map((e) => e.title)
              .join(', ');
            console.log(`[agent-memory] Relevant experiences: ${expSummary}`);
          }

          // Track active episode for auto-logging
          const episodeId = result?.episode?.id;
          if (episodeId) {
            mcpClient.setEpisodeId(episodeId);
          }

          // F9: Warm session cache (non-blocking)
          mcpClient
            .callTool('memory_latent', {
              action: 'warm_session',
              sessionId: `opencode-${sessionId}`,
              limit: 50,
            })
            .catch(() => {});

          const byType = result?.context?.summary?.byType ?? {};
          const guidelines = byType.guideline ?? 0;
          const knowledge = byType.knowledge ?? 0;
          const tools = byType.tool ?? 0;
          const total = guidelines + knowledge + tools;

          if (total > 0) {
            await showToast(`Loaded ${guidelines}g, ${knowledge}k, ${tools}t`, 'success');
          } else {
            await showToast('Session started (no entries)', 'info');
          }
        } catch (e) {
          console.error('[agent-memory] Session start failed:', e);
          await showToast('Session started', 'success');
        }
      }

      // Handle session deleted
      if (event.type === 'session.deleted') {
        await ensureProjectId();
        const sessionId = event.properties?.id;
        if (!sessionId) return;

        const msgs = await getSessionMessages(sessionId);
        if (msgs.length === 0) return;

        try {
          // Complete active episode if exists
          const episodeId = mcpClient.getEpisodeId();
          if (episodeId) {
            await mcpClient.callTool('memory_episode', {
              action: 'complete',
              id: episodeId,
              outcome: 'Session ended',
              outcomeType: 'success',
            });
            mcpClient.setEpisodeId(undefined);
          }

          // End session and capture transcript
          await mcpClient.callTool('memory_session', {
            action: 'end',
            id: sessionId,
          });

          // Optionally extract from transcript
          const transcript = msgs.map((m) => `${m.role}: ${m.content}`).join('\n\n');
          if (transcript.length > 100) {
            await mcpClient.callTool('memory_observe', {
              action: 'extract',
              context: transcript.slice(0, 10000), // Limit size
              contextType: 'conversation',
              autoStore: false,
            });
          }

          // Trigger librarian analysis for pattern detection (non-blocking)
          mcpClient
            .callTool('memory_librarian', {
              action: 'analyze',
              scopeType: 'project',
              lookbackDays: 7,
              dryRun: false,
            })
            .then(async (result) => {
              const r = result as { recommendations?: unknown[] };
              if (r?.recommendations && r.recommendations.length > 0) {
                await showToast(`🔍 ${r.recommendations.length} patterns found`, 'info');
              }
            })
            .catch(() => {});

          // F7: Auto-consolidate stale entries (non-blocking)
          mcpClient
            .callTool('memory_consolidate', {
              action: 'archive_stale',
              scopeType: 'project',
              staleDays: 90,
              dryRun: false,
            })
            .catch(() => {});

          await showToast('Session ended', 'info');
        } catch (e) {
          console.error('[agent-memory] Session end failed:', e);
        }
      }

      // Assistant Response Capture - log to episode
      if (event.type === 'message.updated') {
        const props = event.properties as { role?: string; content?: unknown };
        const role = props?.role;
        const content = props?.content;

        if (role === 'assistant' && content) {
          const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

          // Log to active episode as message event
          const episodeId = mcpClient.getEpisodeId();
          if (episodeId) {
            mcpClient
              .callTool('memory_episode', {
                action: 'log',
                id: episodeId,
                message: contentStr.slice(0, 500),
                eventType: 'checkpoint',
                data: { role: 'assistant', fullLength: contentStr.length },
              })
              .catch(() => {});
          }
        }
      }

      // F4: File Change Tracking
      if (event.type === 'file.edited') {
        const episodeId = mcpClient.getEpisodeId();
        if (episodeId) {
          const filePath = event.properties?.path ?? 'unknown';
          const changeType = event.properties?.changeType ?? 'modified';

          mcpClient
            .callTool('memory_episode', {
              action: 'log',
              id: episodeId,
              message: `File ${changeType}: ${filePath}`,
              eventType: 'decision',
              data: {
                file: filePath,
                changeType,
                timestamp: Date.now(),
              },
            })
            .catch(() => {});
        }
      }
    },

    'chat.message': async (input, output) => {
      if (output?.message?.role !== 'user') return;

      const text = output.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .filter(Boolean)
        .join('\n')
        .trim();

      if (!text) return;

      await ensureProjectId();
      const inp = input as { sessionID?: string };

      // Log user message to episode
      const episodeId = mcpClient.getEpisodeId();
      if (episodeId && !text.toLowerCase().startsWith('!am')) {
        mcpClient
          .callTool('memory_episode', {
            action: 'log',
            id: episodeId,
            message: text.slice(0, 500),
            eventType: 'checkpoint',
            data: { role: 'user', fullLength: text.length },
          })
          .catch(() => {});
      }

      // Handle !am commands
      if (text.toLowerCase().startsWith('!am')) {
        const parts = text.split(/\s+/);
        const command = parts[1]?.toLowerCase() ?? 'help';
        const rest = parts.slice(2).join(' ');

        let response = '';
        try {
          switch (command) {
            case 'status': {
              const result = await mcpClient.callTool<{ _display?: string }>('memory_status', {});
              response = result?._display ?? JSON.stringify(result, null, 2);
              break;
            }
            case 'remember': {
              if (!rest) {
                response = 'Usage: !am remember <text to store>';
              } else {
                await mcpClient.callTool('memory_remember', { text: rest });
                response = `✓ Stored: "${rest.slice(0, 50)}${rest.length > 50 ? '...' : ''}"`;
              }
              break;
            }
            case 'search':
            case 'query': {
              if (!rest) {
                response = 'Usage: !am search <query>';
              } else {
                const result = await mcpClient.callTool<{
                  results?: unknown[];
                  _highlights?: string;
                }>('memory', { text: rest });
                response = result?._highlights ?? `Found ${result?.results?.length ?? 0} results`;
              }
              break;
            }
            case 'learn': {
              if (!rest) {
                response =
                  'Usage: !am learn <what you learned>\nExample: !am learn Fixed timeout by increasing buffer size';
              } else {
                await mcpClient.callTool('memory_experience', {
                  action: 'learn',
                  text: rest,
                  scopeType: 'project',
                });
                response = `📚 Learned: "${rest.slice(0, 50)}${rest.length > 50 ? '...' : ''}"`;
              }
              break;
            }
            case 'experiences': {
              const result = await mcpClient.callTool<{
                experiences?: Array<{ title?: string; outcome?: string }>;
              }>('memory_experience', {
                action: 'list',
                scopeType: 'project',
                limit: 5,
              });
              const exps = result?.experiences ?? [];
              if (exps.length === 0) {
                response = 'No experiences recorded yet. Use !am learn <text> to record one.';
              } else {
                response = exps
                  .map((e, i) => `${i + 1}. ${e.title ?? 'Untitled'} (${e.outcome ?? 'unknown'})`)
                  .join('\n');
              }
              break;
            }
            case 'review': {
              const subCmd = parts[2]?.toLowerCase() ?? 'list';
              const target = parts[3];
              const sessionResult = await mcpClient.callTool<{
                session?: { id?: string };
              }>('memory_status', {});
              const currentSessionId = sessionResult?.session?.id;

              switch (subCmd) {
                case 'list': {
                  const result = await mcpClient.callTool<{
                    candidates?: ReviewCandidate[];
                    count?: number;
                  }>('memory_review', {
                    action: 'list',
                    sessionId: currentSessionId,
                  });

                  pendingReviewCandidates = result?.candidates ?? [];
                  response = formatReviewList(pendingReviewCandidates);
                  break;
                }
                case 'show': {
                  if (!target) {
                    response = 'Usage: !am review show <n|id>';
                  } else {
                    const resolvedId = resolveReviewTarget(target);
                    if (!resolvedId) {
                      response = `Candidate "${target}" not found. Run !am review list first.`;
                    } else {
                      const result = await mcpClient.callTool<{
                        entry?: {
                          name?: string;
                          content?: string;
                          type?: string;
                        };
                      }>('memory_review', {
                        action: 'show',
                        sessionId: currentSessionId,
                        entryId: resolvedId,
                      });
                      if (result?.entry) {
                        response = `**${result.entry.name}** (${result.entry.type})\n${result.entry.content}`;
                      } else {
                        response = 'Entry not found.';
                      }
                    }
                  }
                  break;
                }
                case 'approve':
                case 'reject':
                case 'skip': {
                  if (!target) {
                    response = `Usage: !am review ${subCmd} <n|id>`;
                  } else {
                    const resolvedId = resolveReviewTarget(target);
                    if (!resolvedId) {
                      response = `Candidate "${target}" not found. Run !am review list first.`;
                    } else {
                      await mcpClient.callTool('memory_review', {
                        action: subCmd,
                        sessionId: currentSessionId,
                        entryId: resolvedId,
                      });
                      pendingReviewCandidates = pendingReviewCandidates.filter(
                        (c) => c.id !== resolvedId && c.shortId !== resolvedId
                      );
                      response = `✓ ${subCmd}d: ${resolvedId}`;
                    }
                  }
                  break;
                }
                default:
                  response = 'Usage: !am review [list|show|approve|reject|skip] <n|id>';
              }
              break;
            }
            case 'librarian': {
              // F2: Trigger librarian analysis manually
              await showToast('🔍 Analyzing patterns...', 'info');
              const result = await mcpClient.callTool<{
                recommendations?: unknown[];
              }>('memory_librarian', {
                action: 'analyze',
                scopeType: 'project',
                lookbackDays: 7,
              });
              const count = result?.recommendations?.length ?? 0;
              response =
                count > 0
                  ? `Found ${count} patterns. Use !am review to see them.`
                  : 'No new patterns detected.';
              break;
            }
            case 'suggestions': {
              if (pendingSuggestions.length === 0) {
                response =
                  'No pending suggestions. Suggestions are generated after task completion.';
              } else {
                response = formatSuggestionsList(pendingSuggestions);
              }
              break;
            }
            case 'approve': {
              const target = parts[2];
              if (!target) {
                response = 'Usage: !am approve <n|n-m|n,m|all|hash>';
              } else if (pendingSuggestions.length === 0) {
                response = 'No pending suggestions to approve.';
              } else {
                const selection = parseSelectionTarget(target, pendingSuggestions.length);
                if (selection.type === 'invalid') {
                  response = `Invalid selection: ${selection.reason}`;
                } else if (selection.type === 'all') {
                  await mcpClient.callTool('memory_extraction_approve', {
                    suggestions: pendingSuggestions,
                  });
                  response = `✓ Approved ${pendingSuggestions.length} suggestion(s)`;
                  pendingSuggestions = [];
                } else if (selection.type === 'indices') {
                  const toApprove = selection.indices
                    .map((i) => pendingSuggestions[i - 1])
                    .filter(Boolean);
                  if (toApprove.length === 0) {
                    response = 'No valid suggestions selected.';
                  } else {
                    await mcpClient.callTool('memory_extraction_approve', {
                      suggestions: toApprove,
                    });
                    const titles = toApprove.map((s) => s?.title).join(', ');
                    const hashes = new Set(toApprove.map((s) => s?.hash));
                    pendingSuggestions = pendingSuggestions.filter((s) => !hashes.has(s.hash));
                    response = `✓ Approved ${toApprove.length}: ${titles}`;
                  }
                } else {
                  const suggestion = pendingSuggestions.find((s) =>
                    s.hash.startsWith(selection.hash)
                  );
                  if (!suggestion) {
                    response = `Suggestion "${selection.hash}" not found.`;
                  } else {
                    await mcpClient.callTool('memory_extraction_approve', {
                      suggestions: [suggestion],
                    });
                    pendingSuggestions = pendingSuggestions.filter(
                      (s) => s.hash !== suggestion.hash
                    );
                    response = `✓ Approved: ${suggestion.title}`;
                  }
                }
              }
              break;
            }
            case 'reject': {
              const target = parts[2];
              if (!target) {
                response = 'Usage: !am reject <n|n-m|n,m|all|hash>';
              } else if (pendingSuggestions.length === 0) {
                response = 'No pending suggestions to reject.';
              } else {
                const selection = parseSelectionTarget(target, pendingSuggestions.length);
                if (selection.type === 'invalid') {
                  response = `Invalid selection: ${selection.reason}`;
                } else if (selection.type === 'all') {
                  const count = pendingSuggestions.length;
                  pendingSuggestions = [];
                  response = `✓ Rejected ${count} suggestion(s)`;
                } else if (selection.type === 'indices') {
                  const toReject = selection.indices
                    .map((i) => pendingSuggestions[i - 1])
                    .filter(Boolean);
                  if (toReject.length === 0) {
                    response = 'No valid suggestions selected.';
                  } else {
                    const titles = toReject.map((s) => s?.title).join(', ');
                    const hashes = new Set(toReject.map((s) => s?.hash));
                    pendingSuggestions = pendingSuggestions.filter((s) => !hashes.has(s.hash));
                    response = `✓ Rejected ${toReject.length}: ${titles}`;
                  }
                } else {
                  const idx = pendingSuggestions.findIndex((s) =>
                    s.hash.startsWith(selection.hash)
                  );
                  if (idx === -1) {
                    response = `Suggestion "${selection.hash}" not found.`;
                  } else {
                    const removed = pendingSuggestions.splice(idx, 1)[0];
                    response = `✓ Rejected: ${removed?.title ?? 'unknown'}`;
                  }
                }
              }
              break;
            }
            case 'graph': {
              // F5: Knowledge Graph operations
              const subCmd = parts[2]?.toLowerCase() ?? 'status';

              switch (subCmd) {
                case 'status': {
                  const result = await mcpClient.callTool<{
                    nodeCount?: number;
                    edgeCount?: number;
                  }>('memory_graph_status', { action: 'status' });
                  response = `Graph: ${result?.nodeCount ?? 0} nodes, ${result?.edgeCount ?? 0} edges`;
                  break;
                }
                case 'add': {
                  const nodeType = parts[3];
                  const name = parts.slice(4).join(' ');
                  if (!nodeType || !name) {
                    response =
                      'Usage: !am graph add <type> <name>\nTypes: file, function, class, module';
                  } else {
                    await mcpClient.callTool('graph_node', {
                      action: 'add',
                      nodeTypeName: nodeType,
                      name,
                      scopeType: 'project',
                    });
                    response = `✓ Added ${nodeType}: ${name}`;
                  }
                  break;
                }
                case 'link': {
                  const source = parts[3];
                  const relation = parts[4];
                  const target = parts[5];
                  if (!source || !relation || !target) {
                    response =
                      'Usage: !am graph link <source> <relation> <target>\nRelations: imports, calls, contains, depends_on';
                  } else {
                    await mcpClient.callTool('graph_edge', {
                      action: 'add',
                      edgeTypeName: relation,
                      sourceId: source,
                      targetId: target,
                    });
                    response = `✓ Linked: ${source} --${relation}--> ${target}`;
                  }
                  break;
                }
                default:
                  response = 'Usage: !am graph [status|add|link]';
              }
              break;
            }
            case 'consolidate': {
              // F7: Memory Consolidation
              const subCmd = parts[2]?.toLowerCase() ?? 'preview';

              switch (subCmd) {
                case 'preview': {
                  const result = await mcpClient.callTool<{
                    stats?: { groupsFound?: number };
                  }>('memory_consolidate', {
                    action: 'find_similar',
                    scopeType: 'project',
                    threshold: 0.85,
                    dryRun: true,
                  });
                  response = `Found ${result?.stats?.groupsFound ?? 0} similar groups`;
                  break;
                }
                case 'dedupe': {
                  await mcpClient.callTool('memory_consolidate', {
                    action: 'dedupe',
                    scopeType: 'project',
                    dryRun: false,
                  });
                  response = '✓ Deduplication complete';
                  break;
                }
                case 'archive': {
                  const days = parseInt(parts[3] ?? '90');
                  await mcpClient.callTool('memory_consolidate', {
                    action: 'archive_stale',
                    scopeType: 'project',
                    staleDays: days,
                    dryRun: false,
                  });
                  response = `✓ Archived entries older than ${days} days`;
                  break;
                }
                default:
                  response = 'Usage: !am consolidate [preview|dedupe|archive [days]]';
              }
              break;
            }
            case 'cache': {
              // F9: Latent Memory/Caching
              const subCmd = parts[2]?.toLowerCase() ?? 'stats';

              switch (subCmd) {
                case 'stats': {
                  const result = await mcpClient.callTool<{
                    hitRate?: number;
                    size?: number;
                  }>('memory_latent', { action: 'stats' });
                  const hitRate = ((result?.hitRate ?? 0) * 100).toFixed(1);
                  response = `Cache: ${result?.size ?? 0} entries, ${hitRate}% hit rate`;
                  break;
                }
                case 'warm': {
                  const sessionResult = await mcpClient.callTool<{
                    session?: { id?: string };
                  }>('memory_status', {});
                  await mcpClient.callTool('memory_latent', {
                    action: 'warm_session',
                    sessionId: sessionResult?.session?.id,
                  });
                  response = '✓ Cache warmed';
                  break;
                }
                case 'prune': {
                  const days = parseInt(parts[3] ?? '30');
                  await mcpClient.callTool('memory_latent', {
                    action: 'prune',
                    staleDays: days,
                  });
                  response = `✓ Pruned entries older than ${days} days`;
                  break;
                }
                default:
                  response = 'Usage: !am cache [stats|warm|prune [days]]';
              }
              break;
            }
            case 'help':
            default: {
              response = `Agent Memory Commands:
!am status         Show session and entry counts
!am remember       Store a memory (guideline/knowledge)
!am search         Search memories
!am learn          Record an experience/learning
!am experiences    List recent experiences

Suggestions (from extraction):
!am suggestions    List pending suggestions
!am approve <sel>  Approve: n, n-m, n,m, all, or hash
!am reject <sel>   Reject: n, n-m, n,m, all, or hash

Review (session candidates):
!am review         List pending candidates
!am review show n  Show full content of item n
!am review approve n  Approve item n
!am review reject n   Reject item n
!am review skip n     Skip item n

Other:
!am librarian      Trigger pattern analysis
!am graph          Knowledge graph operations
!am consolidate    Memory cleanup
!am cache          Cache management
!am help           Show this help`;
              break;
            }
          }
        } catch (e) {
          response = `Error: ${e instanceof Error ? e.message : String(e)}`;
        }

        // Mark original parts as ignored
        for (const part of output.parts) {
          if ('text' in part) (part as { ignored?: boolean }).ignored = true;
        }
        // Add response
        output.parts.push({
          type: 'text',
          text: formatCommandResponse(text, response),
          synthetic: true,
          ignored: true,
        } as never);

        const variant = response.startsWith('✓') ? 'success' : 'info';
        await showToast(`!am ${command}`, variant);
        return;
      }

      // Check for memory triggers in regular messages
      const triggerPatterns = [
        /\b(always|never|must|should)\s+(use|do|have|be|avoid)\b/i,
        /\b(we decided|we chose|the standard is)\b/i,
        /\b(remember that|note that|important:)\b/i,
      ];

      if (triggerPatterns.some((p) => p.test(text))) {
        await showToast('Memory trigger detected', 'info');
      }

      // Check for task completion - capture experience from episode
      if (isTaskCompletion(text)) {
        const episodeId = mcpClient.getEpisodeId();
        if (episodeId) {
          // Log completion event
          mcpClient
            .callTool('memory_episode', {
              action: 'log',
              id: episodeId,
              message: 'Task completed (user confirmed)',
              eventType: 'completed',
            })
            .catch(() => {});

          // Get episode summary and offer to learn from it
          try {
            const episode = await mcpClient.callTool<{
              name?: string;
              events?: Array<{ message?: string; eventType?: string }>;
            }>('memory_episode', {
              action: 'what_happened',
              id: episodeId,
            });

            // If episode has substantive events, auto-capture experience
            const events = episode?.events ?? [];
            const hasSubstantiveWork = events.some(
              (e) => e.eventType === 'checkpoint' || e.eventType === 'decision'
            );

            if (hasSubstantiveWork && episode?.name) {
              await recordExperience(
                episode.name,
                `Session work: ${events.length} events`,
                'Task completed successfully',
                'success'
              );
            }
          } catch {
            // Silently ignore - experience capture is best-effort
          }

          // F1: Trigger extraction and capture suggestions
          try {
            const msgs = inp.sessionID ? await getSessionMessages(inp.sessionID) : [];
            const recentContent = msgs
              .slice(-5)
              .map((m) => `${m.role}: ${m.content}`)
              .join('\n\n');

            if (recentContent.length > 100) {
              const extractResult = await mcpClient.callTool<{
                _suggestions?: ExtractionSuggestion[];
              }>('memory_observe', {
                action: 'extract',
                context: recentContent.slice(0, 5000),
                contextType: 'conversation',
                autoStore: false,
              });

              if (extractResult?._suggestions?.length) {
                pendingSuggestions = extractResult._suggestions;
                await showToast(`💡 ${pendingSuggestions.length} suggestions ready`, 'info');
              }
            }
          } catch {
            // Silently ignore - extraction is best-effort
          }
        }
      }
    },

    'tool.execute.before': async (input, output) => {
      await ensureProjectId();

      const inp = input as {
        tool?: string;
        sessionID?: string;
        callID?: string;
      };
      const toolName = inp.tool ?? '';
      const toolInput = getToolInput(input, output);

      const shortName = toolName.replace(/^agent_memory_/, '');
      await showToast(`⏳ ${shortName}`, 'info');

      try {
        // Get context for this tool (includes guidelines, knowledge)
        const result = await mcpClient.callTool<{
          context?: string;
          blocked?: boolean;
          message?: string;
        }>('memory_context', {
          action: 'get',
          purpose: 'tool_injection',
          toolName,
          scopeType: 'project',
        });

        if (result?.blocked) {
          await showToast(`🚫 Blocked: ${shortName}`, 'warning');
          await logEpisodeError(`Blocked: ${shortName}`, {
            tool: toolName,
            reason: result.message,
          });
          throw new Error(result.message || 'Blocked by Agent Memory policy');
        }

        // Also fetch relevant experiences for this tool
        let experienceContext = '';
        try {
          const expResult = await mcpClient.callTool<{
            experiences?: Array<{
              title?: string;
              content?: string;
              outcome?: string;
            }>;
          }>('memory_experience', {
            action: 'list',
            scopeType: 'project',
            category: shortName.toLowerCase(),
            limit: 3,
          });

          const exps = expResult?.experiences ?? [];
          if (exps.length > 0) {
            experienceContext =
              '\n\n### Relevant Experiences\n' +
              exps
                .map((e) => `- ${e.title}: ${e.content?.slice(0, 100) ?? ''} (${e.outcome})`)
                .join('\n');
          }
        } catch {
          // Experience fetch is optional
        }

        const fullContext = (result?.context ?? '') + experienceContext;
        if (fullContext && inp.callID) {
          pendingContextInjections.set(inp.callID, fullContext);
          if (result?.context || experienceContext) {
            await showToast(result?.message ?? 'Context injected', 'info');
          }
        }
      } catch (e) {
        // Don't block tool execution on context fetch failure
        if ((e as Error).message?.includes('Blocked')) throw e;
      }
    },

    'tool.execute.after': async (input, output) => {
      await ensureProjectId();

      const inp = input as {
        callID?: string;
        tool?: string;
        sessionID?: string;
      };
      const out = output as {
        output?: string;
        error?: string | { message?: string };
      };

      // Inject stored context
      const storedContext = inp.callID ? pendingContextInjections.get(inp.callID) : undefined;
      if (storedContext && out.output !== undefined) {
        out.output += `\n\n<system-reminder>\nPreToolUse hook additional context: ${storedContext}\n</system-reminder>`;
        if (inp.callID) pendingContextInjections.delete(inp.callID);
      }

      const toolName = inp.tool ?? '';
      const shortName = toolName.replace(/^agent_memory_/, '');

      // Check for errors in output
      const hasError =
        out.error ||
        (out.output && /error|failed|exception/i.test(out.output?.slice(0, 200) ?? ''));
      if (hasError) {
        const errorMsg =
          typeof out.error === 'string'
            ? out.error
            : (out.error?.message ?? 'Tool execution failed');
        await logEpisodeError(`Error in ${shortName}: ${errorMsg.slice(0, 100)}`, {
          tool: toolName,
        });
        trackError(toolName, errorMsg);
        await showToast(`⚠️ ${shortName}`, 'warning');
      } else {
        await showToast(`✓ ${shortName}`, 'success');

        // Check for error recovery pattern
        const recoveredFrom = checkErrorRecovery(toolName);
        if (recoveredFrom) {
          // Auto-record error recovery as experience
          await recordExperience(
            `Fixed ${shortName} error`,
            `Error: ${recoveredFrom.message.slice(0, 100)}`,
            `Resolved by re-running ${shortName}`,
            'success'
          );

          // Log recovery event with causal link
          const episodeId = mcpClient.getEpisodeId();
          if (episodeId) {
            mcpClient
              .callTool('memory_episode', {
                action: 'log',
                id: episodeId,
                message: `Recovered from error in ${shortName}`,
                eventType: 'decision',
                data: {
                  tool: toolName,
                  previousError: recoveredFrom.message.slice(0, 100),
                  causedBy: recoveredFrom.eventId,
                },
              })
              .catch(() => {});
          }
        }
      }

      // Record tool usage for analytics (non-blocking)
      const toolInput = getToolInput(input, output);
      const toolResponse = getToolResponse(output);

      mcpClient
        .callTool('memory_analytics', {
          action: 'get_tool_stats',
          toolNames: [toolName],
        })
        .catch(() => {});

      // Auto-log tool call as episode event (non-blocking)
      const episodeId = mcpClient.getEpisodeId();
      if (episodeId && !toolName.startsWith('memory_')) {
        mcpClient
          .callTool('memory_episode', {
            action: 'log',
            id: episodeId,
            message: `Tool: ${shortName}`,
            eventType: 'checkpoint',
            data: {
              tool: toolName,
              input:
                typeof toolInput === 'object' ? JSON.stringify(toolInput).slice(0, 200) : undefined,
            },
          })
          .catch(() => {});

        // F4: Track file modifications from Edit/Write tools
        if (toolName === 'Edit' || toolName === 'Write') {
          const filePath = (toolInput as { file_path?: string })?.file_path;
          if (filePath) {
            mcpClient
              .callTool('memory_episode', {
                action: 'log',
                id: episodeId,
                message: `Modified: ${filePath.split('/').pop()}`,
                eventType: 'decision',
                data: { file: filePath, tool: toolName },
              })
              .catch(() => {});
          }
        }
      }
    },
  };
};

export default AgentMemoryPlugin;
