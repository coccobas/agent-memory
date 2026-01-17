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
import { formatBadges, icons } from '../../utils/terminal-formatter.js';
import type { EntryType, ScopeType } from '../../db/schema.js';
import type { PermissionLevel } from '../../services/permission.service.js';
import type { MemoryHealth } from '../../services/librarian/types.js';
import {
  detectEpisodeTrigger,
  type EpisodeTriggerType,
} from '../../services/intent-detection/patterns.js';

interface QuickstartSummary {
  projectLine?: string;
  sessionLine: string;
  episodeLine?: string;
  countsLine: string;
  criticalLine?: string;
  workItemsLine?: string;
  librarianLine?: string;
  healthLine?: string;
}

/**
 * Build a human-readable summary for quickstart response
 */
function buildQuickstartSummary(
  projectAction: 'created' | 'exists' | 'none' | 'error',
  sessionAction: 'created' | 'resumed' | 'none' | 'error',
  sessionName: string | null,
  projectName: string | null,
  contextResult: Record<string, unknown>,
  permissionsGranted: number,
  pendingRecommendations: number = 0,
  health?: MemoryHealth | null,
  recommendationPreviews: Array<{ title: string; type: string }> = [],
  activeEpisode?: { id: string; name: string; status: string } | null,
  episodeAction: 'exists' | 'created' | 'none' = 'none'
): QuickstartSummary {
  // Project line (only if project was created or attempted)
  let projectLine: string | undefined;
  if (projectAction === 'created') {
    const permNote = permissionsGranted > 0 ? ` + ${permissionsGranted} permissions` : '';
    projectLine = `${icons.success} Project: ${projectName} created${permNote}`;
  } else if (projectAction === 'error') {
    projectLine = `${icons.failure} Project: creation failed`;
  }

  // Session line
  let sessionLine: string;
  const sessionIcon =
    sessionAction === 'created' || sessionAction === 'resumed' ? icons.active : icons.inactive;
  if (sessionAction === 'created') {
    sessionLine = `${icons.session} Session: ${sessionName} ${sessionIcon} created`;
  } else if (sessionAction === 'resumed') {
    sessionLine = `${icons.session} Session: ${sessionName} ${sessionIcon} resumed`;
  } else if (sessionAction === 'error') {
    sessionLine = `${icons.session} Session: ${icons.failure} failed to start`;
  } else {
    sessionLine = `${icons.session} Session: (none)`;
  }

  // Episode line (only if session exists and episode service is available)
  let episodeLine: string | undefined;
  if (activeEpisode) {
    const statusIcon = activeEpisode.status === 'active' ? icons.active : icons.inactive;
    const autoTag = episodeAction === 'created' ? ' (auto)' : '';
    episodeLine = `🎬 Episode: ${activeEpisode.name} ${statusIcon}${autoTag}`;
  }

  // Counts from context - handle both hierarchical and non-hierarchical formats
  const ctx = contextResult as {
    // Non-hierarchical format (verbose: true)
    guidelines?: unknown[];
    knowledge?: unknown[];
    tools?: unknown[];
    // Hierarchical format (verbose: false, default)
    summary?: {
      totalEntries?: number;
      byType?: Record<string, number>;
    };
  };

  // Extract counts based on response format
  let guidelineCount: number;
  let knowledgeCount: number;
  let toolCount: number;

  if (ctx.summary?.byType) {
    // Hierarchical format - counts are in summary.byType
    guidelineCount = ctx.summary.byType.guideline ?? 0;
    knowledgeCount = ctx.summary.byType.knowledge ?? 0;
    toolCount = ctx.summary.byType.tool ?? 0;
  } else {
    // Non-hierarchical format - counts from array lengths
    guidelineCount = ctx.guidelines?.length ?? 0;
    knowledgeCount = ctx.knowledge?.length ?? 0;
    toolCount = ctx.tools?.length ?? 0;
  }

  const badges = [];
  if (guidelineCount > 0) badges.push({ label: 'guidelines', value: guidelineCount });
  if (knowledgeCount > 0) badges.push({ label: 'knowledge', value: knowledgeCount });
  if (toolCount > 0) badges.push({ label: 'tools', value: toolCount });

  const countsLine =
    badges.length > 0
      ? `${icons.project} ${projectName ?? 'Project'}: ${formatBadges(badges)}`
      : `${icons.project} ${projectName ?? 'Project'}: (empty)`;

  // Critical guidelines (priority >= 90) - handle both formats
  // Extend ctx type to include hierarchical critical items and work items
  const ctxWithExtras = contextResult as {
    guidelines?: Array<{ name?: string; priority?: number }>;
    critical?: Array<{ title?: string; priority?: number }>;
    workItems?: Array<{ title?: string; type?: string }>;
  };

  let criticalNames: string[];
  if (ctxWithExtras.critical && ctxWithExtras.critical.length > 0) {
    // Hierarchical format - critical items are pre-extracted with 'title' field
    criticalNames = ctxWithExtras.critical.map((c) => c.title ?? 'unnamed').filter(Boolean);
  } else if (ctxWithExtras.guidelines) {
    // Non-hierarchical format - filter from guidelines array
    criticalNames = ctxWithExtras.guidelines
      .filter((g) => (g.priority ?? 0) >= 90)
      .map((g) => g.name ?? 'unnamed')
      .filter(Boolean);
  } else {
    criticalNames = [];
  }

  const criticalLine =
    criticalNames.length > 0 ? `${icons.warning} Critical: ${criticalNames.join(', ')}` : undefined;

  // Work items ([TODO], [BUG], [LIMITATION], etc.)
  let workItemsLine: string | undefined;
  if (ctxWithExtras.workItems && ctxWithExtras.workItems.length > 0) {
    const workItemTitles = ctxWithExtras.workItems
      .slice(0, 3)
      .map((w) => w.title ?? 'unnamed')
      .filter(Boolean);
    const moreCount = ctxWithExtras.workItems.length - 3;
    const moreText = moreCount > 0 ? ` (+${moreCount} more)` : '';
    workItemsLine = `📋 Work items: ${workItemTitles.join(', ')}${moreText}`;
  }

  // Librarian pending recommendations
  let librarianLine: string | undefined;
  if (pendingRecommendations > 0) {
    const patternWord = pendingRecommendations > 1 ? 'patterns' : 'pattern';
    if (recommendationPreviews.length > 0) {
      // Show preview titles (truncate to fit)
      const previewTitles = recommendationPreviews
        .slice(0, 2)
        .map((r) => (r.title.length > 25 ? r.title.slice(0, 22) + '...' : r.title))
        .join(', ');
      const moreText = pendingRecommendations > 2 ? ` (+${pendingRecommendations - 2} more)` : '';
      librarianLine = `🔔 Librarian: ${previewTitles}${moreText} — use memory_librarian action:approve to accept`;
    } else {
      librarianLine = `🔔 Librarian: ${pendingRecommendations} ${patternWord} ready for review`;
    }
  }

  // Memory health score
  let healthLine: string | undefined;
  if (health) {
    const gradeEmoji =
      health.grade === 'excellent'
        ? '🟢'
        : health.grade === 'good'
          ? '🔵'
          : health.grade === 'fair'
            ? '🟡'
            : '🔴';
    healthLine = `${gradeEmoji} Memory health: ${health.score}/100 (${health.grade})`;
  }

  return {
    projectLine,
    sessionLine,
    episodeLine,
    countsLine,
    criticalLine,
    workItemsLine,
    librarianLine,
    healthLine,
  };
}

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
    // Episode auto-creation
    autoEpisode: {
      type: 'boolean',
      description:
        'Auto-create episode when sessionName indicates substantive work (default: true). ' +
        'Triggers on patterns like "fix bug", "implement feature", "refactor", etc.',
    },
  },
  contextHandler: async (ctx, args) => {
    // Get auto-detected context for defaults
    const detected = ctx.services.contextDetection
      ? await ctx.services.contextDetection.detect()
      : null;

    // Extract all parameters
    const sessionName = args?.sessionName as string | undefined;
    const sessionPurpose = args?.sessionPurpose as string | undefined;
    let projectId = args?.projectId as string | undefined;
    const agentId =
      (args?.agentId as string | undefined) ?? detected?.agentId?.value ?? 'claude-code';
    const inherit = (args?.inherit as boolean) ?? true;
    const limitPerType = (args?.limitPerType as number) ?? 10;

    // Project creation params
    const createProject = args?.createProject as boolean | undefined;
    const projectName = args?.projectName as string | undefined;
    const projectDescription = args?.projectDescription as string | undefined;
    const rootPath = (args?.rootPath as string | undefined) ?? detected?.workingDirectory;

    // Permission params
    const grantPermissions = (args?.grantPermissions as boolean | undefined) ?? createProject;
    const permissionLevel = (args?.permissionLevel as PermissionLevel | undefined) ?? 'write';

    // Verbosity - default to hierarchical (compact) mode
    const verbose = (args?.verbose as boolean) ?? false;

    // Episode auto-creation - default to true
    const autoEpisode = (args?.autoEpisode as boolean) ?? true;

    // Track what was created
    let projectAction: 'created' | 'exists' | 'none' | 'error' = 'none';
    let createdProjectName: string | null = null;
    let permissionsGranted = 0;
    let projectResult: Record<string, unknown> | null = null;

    // Step 1: Project creation (if requested)
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
    const contextResult = await queryHandlers.context(ctx, {
      scopeType: 'project',
      scopeId: projectId, // Will be auto-enriched if not provided
      inherit,
      limitPerType,
      hierarchical: !verbose, // Default to hierarchical mode
    });

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

    // Extract entry counts from context result for graph hint
    const ctxForCounts = contextResult as {
      guidelines?: unknown[];
      knowledge?: unknown[];
      tools?: unknown[];
      summary?: { byType?: Record<string, number> };
    };
    const entryGuidelineCount =
      ctxForCounts.summary?.byType?.guideline ?? ctxForCounts.guidelines?.length ?? 0;
    const entryKnowledgeCount =
      ctxForCounts.summary?.byType?.knowledge ?? ctxForCounts.knowledge?.length ?? 0;
    const entryToolCount = ctxForCounts.summary?.byType?.tool ?? ctxForCounts.tools?.length ?? 0;
    const totalEntries = entryGuidelineCount + entryKnowledgeCount + entryToolCount;

    // Build human-readable summary
    const effectiveSessionName = existingSessionName ?? sessionName ?? null;
    const summary = buildQuickstartSummary(
      projectAction,
      sessionAction,
      effectiveSessionName,
      detectedProjectName,
      contextResult as Record<string, unknown>,
      permissionsGranted,
      pendingRecommendations,
      memoryHealth,
      recommendationPreviews,
      activeEpisode,
      episodeAction
    );

    // Add graph statistics if available
    let graphSummary: string | undefined;
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

          if (nodes.length > 0) {
            graphSummary = `📊 Graph: ${nodes.length} nodes, ${edges.length} edges`;
          } else if (totalEntries > 0) {
            // Hint when entries exist but graph is empty
            graphSummary = `📊 Graph: empty (${totalEntries} entries can be backfilled)`;
            graphStats.hint = `Run memory_librarian action:run_maintenance tasks:["graphBackfill"] to populate`;
          }
        } else {
          // Graph repos not available - show hint about graph feature
          graphStats = { nodes: 0, edges: 0, available: false };
          if (totalEntries > 5) {
            graphSummary = `📊 Graph: available (run maintenance to enable relationship tracking)`;
            graphStats.hint = `The knowledge graph can track relationships between entries. Run memory_librarian action:run_maintenance to enable.`;
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
        experienceCount = experiences.length > 0 ? 1 : 0; // Just check existence
        if (experienceCount === 0 && totalEntries > 3) {
          experienceHint = `💡 Tip: Record learnings with memory_experience action:record_case to enable pattern detection`;
        }
      } catch {
        // Non-fatal
      }
    }

    // Build _display string
    const displayLines: string[] = [];
    if (summary.projectLine) {
      displayLines.push(summary.projectLine);
    }
    displayLines.push(summary.sessionLine);
    if (summary.episodeLine) {
      displayLines.push(summary.episodeLine);
    }
    displayLines.push(summary.countsLine);
    if (summary.criticalLine) {
      displayLines.push(summary.criticalLine);
    }
    if (summary.workItemsLine) {
      displayLines.push(summary.workItemsLine);
    }
    if (summary.librarianLine) {
      displayLines.push(summary.librarianLine);
    }
    if (summary.healthLine) {
      displayLines.push(summary.healthLine);
    }
    if (graphSummary) {
      displayLines.push(graphSummary);
    }
    if (experienceHint) {
      displayLines.push(experienceHint);
    }
    const _display = displayLines.join('\n');

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
              actions: {
                log: `memory_episode action:log id:${activeEpisode.id} message:"..."`,
                complete: `memory_episode action:complete id:${activeEpisode.id} outcome:"..." outcomeType:success`,
              },
            }
          : undefined,
        episodeAction,
        pendingRecommendations,
        recommendations:
          recommendationPreviews.length > 0
            ? {
                count: pendingRecommendations,
                previews: recommendationPreviews,
                actions: {
                  review: 'memory_librarian action:list_recommendations',
                  approve: 'memory_librarian action:approve recommendationId:<id>',
                  reject: 'memory_librarian action:reject recommendationId:<id>',
                },
              }
            : undefined,
        health: memoryHealth,
        graph: graphStats,
        // Discoverability hints
        hints: {
          // Experience recording hint when no experiences exist
          experienceRecording: experienceHint
            ? {
                message: 'Record learnings to enable pattern detection',
                action:
                  'memory_experience action:record_case title:"..." scenario:"..." outcome:"..."',
                hasExperiences: experienceCount > 0,
              }
            : undefined,
          // Hierarchical context hint (always show - it's a key optimization)
          hierarchicalContext: !verbose
            ? {
                message: 'Using hierarchical mode (~90% token savings)',
                fullModeAction: 'memory_quickstart verbose:true for full entries',
              }
            : {
                message: 'Using verbose mode (full entries)',
                compactModeAction: 'memory_quickstart (default) for ~90% token savings',
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
      },
      _display,
    };
  },
};
