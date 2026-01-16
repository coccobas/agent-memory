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

interface QuickstartSummary {
  projectLine?: string;
  sessionLine: string;
  countsLine: string;
  criticalLine?: string;
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
  permissionsGranted: number
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

  // Counts from context
  const ctx = contextResult as {
    guidelines?: unknown[];
    knowledge?: unknown[];
    tools?: unknown[];
  };
  const guidelineCount = ctx.guidelines?.length ?? 0;
  const knowledgeCount = ctx.knowledge?.length ?? 0;
  const toolCount = ctx.tools?.length ?? 0;

  const badges = [];
  if (guidelineCount > 0) badges.push({ label: 'guidelines', value: guidelineCount });
  if (knowledgeCount > 0) badges.push({ label: 'knowledge', value: knowledgeCount });
  if (toolCount > 0) badges.push({ label: 'tools', value: toolCount });

  const countsLine =
    badges.length > 0
      ? `${icons.project} ${projectName ?? 'Project'}: ${formatBadges(badges)}`
      : `${icons.project} ${projectName ?? 'Project'}: (empty)`;

  // Critical guidelines (priority >= 90)
  const guidelines = ctx.guidelines as Array<{ name?: string; priority?: number }> | undefined;
  const criticalGuidelines = guidelines?.filter((g) => (g.priority ?? 0) >= 90) ?? [];
  const criticalLine =
    criticalGuidelines.length > 0
      ? `${icons.warning} Critical: ${criticalGuidelines.map((g) => g.name).join(', ')}`
      : undefined;

  return { projectLine, sessionLine, countsLine, criticalLine };
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
    projectName: { type: 'string', description: 'Name for new project (required if createProject)' },
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

    // Step 3: Load context
    const contextResult = await queryHandlers.context(ctx, {
      scopeType: 'project',
      scopeId: projectId, // Will be auto-enriched if not provided
      inherit,
      limitPerType,
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

    // Build human-readable summary
    const effectiveSessionName = existingSessionName ?? sessionName ?? null;
    const summary = buildQuickstartSummary(
      projectAction,
      sessionAction,
      effectiveSessionName,
      detectedProjectName,
      contextResult as Record<string, unknown>,
      permissionsGranted
    );

    // Add graph statistics if available
    let graphSummary: string | undefined;
    if (detectedProjectId && ctx.repos.graphNodes) {
      try {
        // Get node count for this project
        const nodes = await ctx.repos.graphNodes.list(
          { scopeType: 'project', scopeId: detectedProjectId },
          { limit: 10000 }
        );

        if (nodes.length > 0) {
          // Estimate edge count (avg 1.5 edges per node)
          const estimatedEdges = Math.floor(nodes.length * 1.5);
          graphSummary = `📊 Graph: ${nodes.length} nodes, ${estimatedEdges} edges (avg)`;
        }
      } catch {
        // Non-fatal - graph may not be enabled
      }
    }

    // Build _display string
    const displayLines: string[] = [];
    if (summary.projectLine) {
      displayLines.push(summary.projectLine);
    }
    displayLines.push(summary.sessionLine, summary.countsLine);
    if (summary.criticalLine) {
      displayLines.push(summary.criticalLine);
    }
    if (graphSummary) {
      displayLines.push(graphSummary);
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
      },
      _display,
    };
  },
};
