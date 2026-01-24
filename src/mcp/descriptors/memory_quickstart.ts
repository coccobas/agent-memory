/**
 * memory_quickstart tool descriptor
 *
 * Composite tool that streamlines UX by combining:
 * 1. Project creation (optional, if createProject=true)
 * 2. Permission grants (optional, if grantPermissions=true)
 * 3. Context loading (memory_query action:context)
 * 4. Session start (optional, if sessionName provided)
 *
 * This reduces the typical 4-5 tool calls at project setup to just 1.
 */

import type { SimpleToolDescriptor } from './types.js';
import { queryHandlers } from '../handlers/query.handler.js';
import { scopeHandlers } from '../handlers/scopes.handler.js';
import type { SessionStartParams } from '../types.js';
import {
  formatQuickstartDashboard,
  type QuickstartDisplayData,
  type QuickstartDisplayMode,
} from '../../utils/terminal-formatter.js';
import { formatQuickstartMinto, type QuickstartMintoInput } from '../../utils/minto-formatter.js';
import type { EntryType, ScopeType } from '../../db/schema.js';
import type { PermissionLevel } from '../../services/permission.service.js';
import type { MemoryHealth } from '../../services/librarian/types.js';
import {
  detectEpisodeTrigger,
  type EpisodeTriggerType,
} from '../../services/intent-detection/patterns.js';
import { checkStaleCode, type StaleCodeInfo } from '../../utils/server-diagnostics.js';
import { getWorkingDirectoryAsync } from '../../utils/working-directory.js';
import type { WhatHappenedResult } from '../../services/episode/index.js';

export const memoryQuickstartDescriptor: SimpleToolDescriptor = {
  name: 'memory_quickstart',
  visibility: 'core',
  description:
    'One-call setup for memory context and session. Auto-detects project from cwd. ' +
    'Can also create projects and grant permissions in a single call.',
  params: {
    // Session params
    sessionName: { type: 'string', description: 'Start session with this name' },
    sessionPurpose: { type: 'string' },
    projectId: { type: 'string' },
    agentId: { type: 'string' },
    inherit: { type: 'boolean' },
    limitPerType: { type: 'number' },
    // Project creation params
    createProject: {
      type: 'boolean',
      description: 'Create project if it does not exist (requires projectName)',
    },
    projectName: {
      type: 'string',
      description: 'Name for new project (required if createProject)',
    },
    projectDescription: { type: 'string', description: 'Description for new project' },
    rootPath: {
      type: 'string',
      description: 'Root path for project (auto-detected from cwd if not provided)',
    },
    // Permission params
    grantPermissions: {
      type: 'boolean',
      description: 'Grant permissions to agent (default: true when createProject)',
    },
    permissionLevel: {
      type: 'string',
      enum: ['read', 'write', 'admin'],
      description: 'Permission level to grant (default: write)',
    },
    // Output verbosity
    verbose: {
      type: 'boolean',
      description: 'Return full context instead of hierarchical summary (default: false)',
    },
    // Display mode
    displayMode: {
      type: 'string',
      enum: ['compact', 'standard', 'full'],
      description:
        'Display verbosity: compact (1-line summary), standard (boxed sections, default), full (with hints)',
    },
    // Episode auto-creation
    autoEpisode: {
      type: 'boolean',
      description:
        'Auto-create episode when sessionName indicates substantive work (default: true). ' +
        'Triggers on patterns like "fix bug", "implement feature", "refactor", etc.',
    },
    mintoStyle: {
      type: 'boolean',
      description:
        'Use Minto Pyramid format (default: true). Set false for verbose dashboard output.',
    },
  },
  contextHandler: async (ctx, args) => {
    const sessionName = args?.sessionName as string | undefined;
    const sessionPurpose = args?.sessionPurpose as string | undefined;
    let projectId = args?.projectId as string | undefined;
    let agentId = (args?.agentId as string | undefined) ?? 'claude-code';
    const inherit = (args?.inherit as boolean) ?? true;
    const limitPerType = (args?.limitPerType as number) ?? 10;

    const createProject = args?.createProject as boolean | undefined;
    const projectName = args?.projectName as string | undefined;
    const projectDescription = args?.projectDescription as string | undefined;
    let rootPath = args?.rootPath as string | undefined;

    if ((!projectId || !rootPath) && ctx.services.contextDetection) {
      const detected = await ctx.services.contextDetection.detect();
      projectId = projectId ?? detected?.project?.id;
      rootPath = rootPath ?? detected?.workingDirectory;
      agentId = detected?.agentId?.value ?? agentId;
    }
    rootPath = rootPath ?? (await getWorkingDirectoryAsync()).path;

    // Permission params
    const grantPermissions = (args?.grantPermissions as boolean | undefined) ?? createProject;
    const permissionLevel = (args?.permissionLevel as PermissionLevel | undefined) ?? 'write';

    // Verbosity - default to hierarchical (compact) mode
    const verbose = (args?.verbose as boolean) ?? false;

    // Display mode - default to standard
    const displayMode = (args?.displayMode as QuickstartDisplayMode) ?? 'standard';

    // Episode auto-creation - default to true
    const autoEpisode = (args?.autoEpisode as boolean) ?? true;

    const mintoStyle = (args?.mintoStyle as boolean) ?? true;

    let projectAction: 'created' | 'exists' | 'none' | 'error' = 'none';
    let createdProjectName: string | null = null;
    let permissionsGranted = 0;
    let projectResult: Record<string, unknown> | null = null;

    if (createProject) {
      if (!projectName) {
        return {
          error: 'projectName is required when createProject is true',
          code: 'E4001',
        };
      }

      try {
        // Check if project already exists at this rootPath
        const existingProject = rootPath ? await ctx.repos.projects.findByPath(rootPath) : null;

        if (existingProject) {
          // Project already exists, use it
          projectId = existingProject.id;
          createdProjectName = existingProject.name;
          projectAction = 'exists';
          projectResult = { existing: true, project: existingProject };
        } else {
          // Create new project
          const newProject = await ctx.repos.projects.create({
            name: projectName,
            description: projectDescription,
            rootPath,
          });
          projectId = newProject.id;
          createdProjectName = projectName;
          projectAction = 'created';
          projectResult = { created: true, project: newProject };

          // Step 2: Grant permissions (if requested or default with createProject)
          if (grantPermissions && projectId) {
            const entryTypes: EntryType[] = ['guideline', 'knowledge', 'tool'];
            for (const entryType of entryTypes) {
              try {
                ctx.services.permission.grant({
                  agentId,
                  scopeType: 'project' as ScopeType,
                  scopeId: projectId,
                  entryType,
                  permission: permissionLevel,
                });
                permissionsGranted++;
              } catch {
                // Permission grant failed, continue with others
              }
            }
          }
        }
      } catch (error) {
        projectAction = 'error';
        projectResult = {
          error: 'Failed to create project',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // Step 3: Load context (hierarchical mode by default for ~90% token savings)
    let contextStats: {
      tokensUsed?: number;
      tokenBudget?: number;
      stalenessWarnings?: Array<{ entryId: string; reason: string; recommendation: string }>;
    } | null = null;

    if (ctx.services.unifiedContext && projectId) {
      const unifiedResult = await ctx.services.unifiedContext.getContext({
        purpose: { type: 'session_start' },
        scopeType: 'project',
        scopeId: projectId,
        format: 'markdown',
      });
      if (unifiedResult.success) {
        contextStats = {
          tokensUsed: unifiedResult.stats.tokensUsed,
          tokenBudget: unifiedResult.stats.tokenBudget,
          stalenessWarnings: unifiedResult.stalenessWarnings,
        };
      }
    }

    const contextResult = (await queryHandlers.context(ctx, {
      scopeType: 'project',
      scopeId: projectId,
      inherit,
      limitPerType,
      hierarchical: !verbose,
    })) as Record<string, unknown>;

    // Extract detected project from context result
    const contextWithMeta = contextResult as {
      _context?: { project?: { id: string; name?: string } };
    };
    const detectedProjectId = projectId ?? contextWithMeta?._context?.project?.id;
    const detectedProjectName =
      createdProjectName ?? contextWithMeta?._context?.project?.name ?? null;

    // Step 4: Optionally start session (or resume existing active session)
    let sessionResult: Record<string, unknown> | null = null;
    let sessionAction: 'created' | 'resumed' | 'none' | 'error' = 'none';
    let existingSessionName: string | null = null;

    if (sessionName && detectedProjectId) {
      try {
        // Check for existing active session in this project
        const activeSessions = await ctx.repos.sessions.list(
          { projectId: detectedProjectId, status: 'active' },
          { limit: 1 }
        );

        const existingSession = activeSessions[0];
        if (existingSession) {
          // Resume existing session instead of creating new one
          existingSessionName = existingSession.name ?? null;
          sessionResult = {
            success: true,
            session: existingSession,
            resumed: true,
          };
          sessionAction = 'resumed';
        } else {
          // Create new session
          const sessionParams: SessionStartParams = {
            projectId: detectedProjectId,
            name: sessionName,
            purpose: sessionPurpose,
            agentId,
          };
          sessionResult = (await scopeHandlers.sessionStart(ctx, sessionParams)) as Record<
            string,
            unknown
          >;
          sessionAction = 'created';
        }
      } catch (error) {
        // Session start failed, include error in response but don't fail the whole call
        sessionResult = {
          error: 'Failed to start session',
          message: error instanceof Error ? error.message : String(error),
        };
        sessionAction = 'error';
      }
    }

    // Fetch or auto-create episode for the session
    let activeEpisode: { id: string; name: string; status: string } | null = null;
    let episodeAction: 'exists' | 'created' | 'none' = 'none';
    let episodeTrigger: { type: EpisodeTriggerType | null; confidence: number } | null = null;
    let episodeSummary: WhatHappenedResult | null = null;
    const sessionObj = sessionResult?.session as { id?: string } | undefined;
    const sessionId = sessionObj?.id;
    if (sessionId && ctx.services.episode) {
      try {
        // First check for existing active episode
        const existingEpisode = await ctx.services.episode.getActiveEpisode(sessionId);
        if (existingEpisode) {
          activeEpisode = {
            id: existingEpisode.id,
            name: existingEpisode.name,
            status: existingEpisode.status,
          };
          episodeAction = 'exists';

          // Fetch episode summary for resume context
          try {
            episodeSummary = await ctx.services.episode.whatHappened(existingEpisode.id);
          } catch {
            // Non-fatal - episode summary is optional
          }
        } else if (autoEpisode && sessionName) {
          // No active episode - check if we should auto-create one
          const triggerMatch = detectEpisodeTrigger(sessionName);
          if (triggerMatch.shouldCreate) {
            episodeTrigger = {
              type: triggerMatch.triggerType,
              confidence: triggerMatch.confidence,
            };
            // Create and start episode
            const createdEpisode = await ctx.services.episode.create({
              sessionId,
              scopeType: 'session',
              scopeId: sessionId,
              name: sessionName,
              triggerType: 'auto_detection',
              triggerRef: triggerMatch.triggerType ?? 'heuristic',
              metadata: {
                autoCreated: true,
                triggerPatterns: triggerMatch.matchedPatterns,
                triggerConfidence: triggerMatch.confidence,
              },
            });
            // Start the episode immediately
            const newEpisode = await ctx.services.episode.start(createdEpisode.id);
            activeEpisode = {
              id: newEpisode.id,
              name: newEpisode.name,
              status: newEpisode.status,
            };
            episodeAction = 'created';
          }
        }
      } catch {
        // Non-fatal - episode service may not be fully initialized
      }
    }

    // Fetch pending librarian recommendations and memory health
    let pendingRecommendations = 0;
    let recommendationPreviews: Array<{
      id: string;
      title: string;
      type: string;
      confidence: number;
    }> = [];
    let memoryHealth: MemoryHealth | null = null;
    if (detectedProjectId && ctx.services.librarian) {
      try {
        const store = ctx.services.librarian.getRecommendationStore();
        pendingRecommendations = await store.count({
          status: 'pending',
          scopeType: 'project',
          scopeId: detectedProjectId,
        });

        // Fetch preview of top recommendations if any exist
        if (pendingRecommendations > 0) {
          const topRecs = await store.list(
            { status: 'pending', scopeType: 'project', scopeId: detectedProjectId },
            { limit: 3 }
          );
          recommendationPreviews = topRecs.map((r) => ({
            id: r.id,
            title: r.title,
            type: r.type,
            confidence: r.confidence,
          }));
        }
      } catch {
        // Non-fatal - librarian may not be enabled
      }

      // Fetch memory health score
      try {
        if (ctx.services.librarian.hasMaintenanceOrchestrator()) {
          memoryHealth = await ctx.services.librarian.getHealth('project', detectedProjectId);
        }
      } catch {
        // Non-fatal - maintenance orchestrator may not be initialized
      }
    }

    // Fetch pending tasks from memory_task
    let pendingTasks: Array<{ id: string; title: string; taskType: string; status: string }> = [];
    if (detectedProjectId && ctx.repos.tasks) {
      try {
        const openTasks = await ctx.repos.tasks.list(
          {
            status: 'open',
            scopeType: 'project',
            scopeId: detectedProjectId,
            includeInactive: false,
          },
          { limit: 5 }
        );
        const inProgressTasks = await ctx.repos.tasks.list(
          {
            status: 'in_progress',
            scopeType: 'project',
            scopeId: detectedProjectId,
            includeInactive: false,
          },
          { limit: 3 }
        );
        pendingTasks = [...inProgressTasks, ...openTasks].slice(0, 5).map((t) => ({
          id: t.id,
          title: t.title,
          taskType: t.taskType,
          status: t.status,
        }));
      } catch {
        // Non-fatal - task repo may not be available
      }
    }

    // Fetch recent completed episodes for context about previous work
    let recentEpisodes: Array<{
      name: string;
      outcome: string | null;
      outcomeType: string | null;
      completedAt: string | null;
    }> = [];
    if (detectedProjectId && ctx.repos.episodes) {
      try {
        const completedEpisodes = await ctx.repos.episodes.list(
          {
            scopeType: 'project',
            scopeId: detectedProjectId,
            status: 'completed',
            includeInactive: false,
          },
          { limit: 5 }
        );
        // Sort by endedAt descending (most recent first)
        const sortedEpisodes = [...completedEpisodes].sort((a, b) => {
          const aTime = a.endedAt ? new Date(a.endedAt).getTime() : 0;
          const bTime = b.endedAt ? new Date(b.endedAt).getTime() : 0;
          return bTime - aTime;
        });
        recentEpisodes = sortedEpisodes.map((e) => ({
          name: e.name,
          outcome: e.outcome,
          outcomeType: e.outcomeType,
          completedAt: e.endedAt,
        }));
      } catch {
        // Non-fatal - episodes repo may not be available
      }
    }

    // Extract entry counts from context result for graph hint
    const ctxForCounts = contextResult as {
      guidelines?: Array<{ name?: string; priority?: number }>;
      knowledge?: unknown[];
      tools?: unknown[];
      summary?: { byType?: Record<string, number> };
      critical?: Array<{ title?: string; priority?: number }>;
      workItems?: Array<{ title?: string; type?: string }>;
    };
    const entryGuidelineCount =
      ctxForCounts.summary?.byType?.guideline ?? ctxForCounts.guidelines?.length ?? 0;
    const entryKnowledgeCount =
      ctxForCounts.summary?.byType?.knowledge ?? ctxForCounts.knowledge?.length ?? 0;
    const entryToolCount = ctxForCounts.summary?.byType?.tool ?? ctxForCounts.tools?.length ?? 0;
    const totalEntries = entryGuidelineCount + entryKnowledgeCount + entryToolCount;

    // Extract critical guideline names for display
    let criticalNames: string[];
    if (ctxForCounts.critical && ctxForCounts.critical.length > 0) {
      // Hierarchical format - critical items are pre-extracted with 'title' field
      criticalNames = ctxForCounts.critical.map((c) => c.title ?? 'unnamed').filter(Boolean);
    } else if (ctxForCounts.guidelines) {
      // Non-hierarchical format - filter from guidelines array
      criticalNames = ctxForCounts.guidelines
        .filter((g) => (g.priority ?? 0) >= 90)
        .map((g) => g.name ?? 'unnamed')
        .filter(Boolean);
    } else {
      criticalNames = [];
    }

    // Build effective session name for display
    const effectiveSessionName = existingSessionName ?? sessionName ?? null;

    // Add graph statistics if available
    let graphStats: { nodes: number; edges: number; hint?: string; available: boolean } | undefined;
    if (detectedProjectId) {
      try {
        // Try to get graph stats - may not be available in all setups
        if (ctx.repos.graphNodes && ctx.repos.graphEdges) {
          const nodes = await ctx.repos.graphNodes.list(
            { scopeType: 'project', scopeId: detectedProjectId },
            { limit: 10000 }
          );
          const edges = await ctx.repos.graphEdges.list({}, { limit: 10000 });

          graphStats = { nodes: nodes.length, edges: edges.length, available: true };

          if (nodes.length === 0 && totalEntries > 0) {
            graphStats.hint = 'Graph empty - run maintenance to populate';
          }
        } else {
          graphStats = { nodes: 0, edges: 0, available: false };
          if (totalEntries > 5) {
            graphStats.hint = 'Knowledge graph available for relationship tracking';
          }
        }
      } catch {
        // Non-fatal - graph may not be enabled
      }
    }

    // Check for experiences
    let experienceCount = 0;
    let experienceHint: string | undefined;
    if (detectedProjectId) {
      try {
        const experiences = await ctx.repos.experiences.list(
          { scopeType: 'project', scopeId: detectedProjectId },
          { limit: 1 }
        );
        experienceCount = experiences.length > 0 ? 1 : 0;
        if (experienceCount === 0 && totalEntries > 3) {
          experienceHint = 'Record learnings to enable pattern detection';
        }
      } catch {
        // Non-fatal
      }
    }

    // Check for stale code (dist/ modified after server start)
    let staleCodeInfo: StaleCodeInfo | null = null;
    try {
      staleCodeInfo = await checkStaleCode();
    } catch {
      // Non-fatal - stale code detection is optional
    }

    // Build _display string using the new formatter
    const displayData: QuickstartDisplayData = {
      projectName: detectedProjectName,
      session: {
        name: effectiveSessionName,
        status: sessionAction === 'created' ? 'active' : sessionAction,
      },
      episode: activeEpisode
        ? {
            name: activeEpisode.name,
            status: activeEpisode.status,
            autoCreated: episodeAction === 'created',
          }
        : null,
      counts: {
        guidelines: entryGuidelineCount,
        knowledge: entryKnowledgeCount,
        tools: entryToolCount,
      },
      critical: criticalNames.length > 0 ? criticalNames : undefined,
      // Combine memory_task items (priority) with legacy prefix-based work items
      workItems: [
        ...pendingTasks.map(
          (t) => `[${t.status === 'in_progress' ? 'WIP' : t.taskType.toUpperCase()}] ${t.title}`
        ),
        ...(ctxForCounts.workItems?.slice(0, 3).map((w) => w.title ?? 'unnamed') ?? []),
      ].slice(0, 5),
      health: memoryHealth ? { score: memoryHealth.score, grade: memoryHealth.grade } : null,
      graph: graphStats
        ? { nodes: graphStats.nodes, edges: graphStats.edges, hint: graphStats.hint }
        : null,
      librarian:
        pendingRecommendations > 0
          ? {
              pendingCount: pendingRecommendations,
              previews: recommendationPreviews.map((r) => ({ title: r.title, type: r.type })),
            }
          : null,
      hints: {
        experienceRecording: experienceHint ?? undefined,
        tip: graphStats?.hint,
      },
      serverStatus: staleCodeInfo?.isStale
        ? {
            isStale: true,
            message: staleCodeInfo.message,
            processStartedAt: staleCodeInfo.processStartedAt?.toISOString(),
            distModifiedAt: staleCodeInfo.distModifiedAt?.toISOString(),
          }
        : null,
      // Resume summary - shown when picking up an existing episode
      resumeSummary:
        episodeAction === 'exists' && episodeSummary ? buildResumeSummary(episodeSummary) : null,
    };

    let _display: string;
    if (mintoStyle) {
      const mintoInput: QuickstartMintoInput = {
        projectName: detectedProjectName,
        sessionName: effectiveSessionName,
        sessionAction,
        episodeName: activeEpisode?.name ?? null,
        entryCounts: {
          guidelines: entryGuidelineCount,
          knowledge: entryKnowledgeCount,
          tools: entryToolCount,
          experiences: experienceCount,
        },
        healthScore: memoryHealth?.score,
        healthGrade: memoryHealth?.grade,
        pendingTasks: pendingTasks.length > 0 ? pendingTasks.length : undefined,
        pendingRecommendations: pendingRecommendations > 0 ? pendingRecommendations : undefined,
        staleCodeWarning: staleCodeInfo?.isStale ? staleCodeInfo.message : undefined,
      };
      _display = formatQuickstartMinto(mintoInput);
    } else {
      _display = formatQuickstartDashboard(displayData, displayMode);
    }

    // Build combined response with clear action indicator
    return {
      context: contextResult,
      session: sessionResult,
      project: projectResult,
      quickstart: {
        contextLoaded: true,
        projectAction,
        projectCreated: projectAction === 'created',
        permissionsGranted,
        sessionAction,
        sessionStarted: sessionAction === 'created',
        sessionResumed: sessionAction === 'resumed',
        resumedSessionName: existingSessionName,
        requestedSessionName: sessionName,
        projectId: detectedProjectId,
        activeEpisode: activeEpisode
          ? {
              id: activeEpisode.id,
              name: activeEpisode.name,
              status: activeEpisode.status,
              autoCreated: episodeAction === 'created',
              trigger: episodeTrigger,
            }
          : undefined,
        episodeAction,
        pendingRecommendations,
        recommendations:
          recommendationPreviews.length > 0
            ? {
                count: pendingRecommendations,
                previews: recommendationPreviews,
              }
            : undefined,
        health: memoryHealth,
        graph: graphStats,
        contextBudget: contextStats
          ? {
              tokensUsed: contextStats.tokensUsed,
              tokenBudget: contextStats.tokenBudget,
              stalenessWarnings: contextStats.stalenessWarnings?.length ?? 0,
            }
          : undefined,
        // Pending tasks from memory_task
        pendingTasks:
          pendingTasks.length > 0
            ? {
                count: pendingTasks.length,
                items: pendingTasks,
              }
            : undefined,
        // Recent completed episodes for context about previous work
        recentWork:
          recentEpisodes.length > 0
            ? {
                count: recentEpisodes.length,
                episodes: recentEpisodes.map((e) => ({
                  name: e.name,
                  outcome: e.outcome
                    ? e.outcome.length > 60
                      ? e.outcome.slice(0, 57) + '...'
                      : e.outcome
                    : null,
                  result: e.outcomeType,
                  completedAt: e.completedAt,
                })),
              }
            : undefined,
        // Discoverability hints
        hints: {
          // Experience recording hint when no experiences exist
          experienceRecording: experienceHint
            ? {
                message: 'Record learnings to enable pattern detection',
                hasExperiences: experienceCount > 0,
              }
            : undefined,
          // Hierarchical context hint (always show - it's a key optimization)
          hierarchicalContext: {
            message: !verbose
              ? 'Using hierarchical mode (~90% token savings)'
              : 'Using verbose mode (full entries)',
          },
          // Auto-tagging info
          autoTagging: {
            enabled: ctx.config.autoTagging?.enabled ?? true,
            message: 'Tags are automatically inferred and attached to new entries',
          },
          // Session timeout info
          sessionTimeout: {
            enabled: ctx.config.autoContext?.sessionTimeoutEnabled ?? true,
            inactivityMinutes: Math.round(
              (ctx.config.autoContext?.sessionInactivityMs ?? 1800000) / 60000
            ),
            message:
              ctx.config.autoContext?.sessionTimeoutEnabled !== false
                ? `Sessions auto-end after ${Math.round((ctx.config.autoContext?.sessionInactivityMs ?? 1800000) / 60000)} min of inactivity`
                : 'Session auto-timeout is disabled',
          },
        },
        // Server status - stale code detection
        serverStatus: staleCodeInfo
          ? {
              isStale: staleCodeInfo.isStale,
              message: staleCodeInfo.message,
              processStartedAt: staleCodeInfo.processStartedAt?.toISOString(),
              distModifiedAt: staleCodeInfo.distModifiedAt?.toISOString(),
              action: staleCodeInfo.isStale
                ? 'Restart Claude Code to pick up new changes'
                : undefined,
            }
          : undefined,
      },
      _display,
    };
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Build a resume summary from the whatHappened result
 */
function buildResumeSummary(
  summary: WhatHappenedResult
): NonNullable<QuickstartDisplayData['resumeSummary']> {
  const episode = summary.episode;

  // Calculate duration if episode has started
  let duration: string | undefined;
  if (episode.startedAt) {
    const startTime = new Date(episode.startedAt).getTime();
    const now = Date.now();
    const durationMs = now - startTime;
    duration = formatDuration(durationMs);
  }

  // Transform timeline events to key events
  const keyEvents: Array<{
    type: 'checkpoint' | 'decision' | 'error' | 'started' | 'completed';
    message: string;
    timestamp?: string;
  }> = [];

  for (const entry of summary.timeline) {
    if (entry.type === 'episode_start') {
      keyEvents.push({
        type: 'started',
        message: entry.description ?? `Started: ${entry.name}`,
        timestamp: entry.timestamp,
      });
    } else if (entry.type === 'event') {
      // Map event types to our display types
      const eventType = mapEventType(entry.name);
      keyEvents.push({
        type: eventType,
        message: entry.description ?? entry.name,
        timestamp: entry.timestamp,
      });
    } else if (entry.type === 'episode_end') {
      keyEvents.push({
        type: 'completed',
        message: entry.description ?? `Completed: ${entry.name}`,
        timestamp: entry.timestamp,
      });
    }
  }

  // Transform linked entities
  const linkedEntities: Array<{
    type: 'guideline' | 'knowledge' | 'tool' | 'experience';
    title: string;
  }> = [];

  for (const entity of summary.linkedEntities) {
    const entityType = entity.entryType as 'guideline' | 'knowledge' | 'tool' | 'experience';
    if (['guideline', 'knowledge', 'tool', 'experience'].includes(entityType)) {
      linkedEntities.push({
        type: entityType,
        // LinkedEntity only has entryId, use it with role context
        title: entity.role ? `${entity.role}: ${entity.entryId}` : entity.entryId,
      });
    }
  }

  // Build status from episode outcome (if available) or recent events
  let status:
    | {
        issue?: string;
        rootCause?: string;
        findings?: string[];
      }
    | undefined;

  // Look for structured status in episode metadata or events
  const decisionEvents = summary.timeline.filter(
    (e) => e.type === 'event' && e.name?.toLowerCase().includes('decision')
  );
  const checkpointEvents = summary.timeline.filter(
    (e) => e.type === 'event' && e.name?.toLowerCase().includes('checkpoint')
  );
  const errorEvents = summary.timeline.filter(
    (e) => e.type === 'event' && e.name?.toLowerCase().includes('error')
  );

  // Extract findings from checkpoint/decision events
  const findings = [
    ...checkpointEvents.slice(-3).map((e) => e.description ?? e.name),
    ...decisionEvents.slice(-2).map((e) => e.description ?? e.name),
  ].filter(Boolean);

  // Extract issue from error events
  const issue = errorEvents.length > 0 ? errorEvents[0]?.description : undefined;

  if (findings.length > 0 || issue) {
    status = {
      issue,
      findings: findings.length > 0 ? findings : undefined,
    };
  }

  return {
    episodeName: episode.name,
    duration,
    keyEvents,
    linkedEntities: linkedEntities.length > 0 ? linkedEntities : undefined,
    status,
  };
}

/**
 * Map event name to display type
 */
function mapEventType(
  eventName: string
): 'checkpoint' | 'decision' | 'error' | 'started' | 'completed' {
  const lower = eventName.toLowerCase();
  if (lower.includes('error') || lower.includes('fail')) return 'error';
  if (lower.includes('decision') || lower.includes('chose') || lower.includes('decided'))
    return 'decision';
  if (lower.includes('start') || lower.includes('begin')) return 'started';
  if (lower.includes('complete') || lower.includes('done') || lower.includes('finish'))
    return 'completed';
  return 'checkpoint';
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}
