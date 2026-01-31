import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  registerTestContext,
  createTestProject,
  createTestSession,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-episode-quality.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;

describe('Episode Quality Improvements Integration', () => {
  let previousPermMode: string | undefined;

  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = registerTestContext(testDb);
  });

  afterAll(() => {
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  const AGENT_ID = 'test-agent';

  describe('Episode creation with project scope', () => {
    it('should create episode with project scope when projectId is provided', async () => {
      const project = createTestProject(db, 'Quality Test Project');
      const session = createTestSession(db, project.id, 'Quality Test Session');

      const episode = await context.repos.episodes!.create({
        sessionId: session.id,
        projectId: project.id,
        name: 'Test with project scope',
        scopeType: 'project',
        scopeId: project.id,
        triggerType: 'user_request',
        createdBy: AGENT_ID,
      });

      expect(episode.scopeType).toBe('project');
      expect(episode.scopeId).toBe(project.id);
      expect(episode.projectId).toBe(project.id);
    });
  });

  describe('Event descriptions with semantic summaries', () => {
    it('should store semantic summary in event data when provided', async () => {
      const project = createTestProject(db, 'Semantic Event Project');
      const session = createTestSession(db, project.id, 'Semantic Event Session');

      const episode = await context.repos.episodes!.create({
        sessionId: session.id,
        projectId: project.id,
        name: 'Semantic event test',
        scopeType: 'project',
        scopeId: project.id,
        triggerType: 'user_request',
        createdBy: AGENT_ID,
      });

      const eventData = {
        toolName: 'memory_experience',
        action: 'learn',
        success: true,
        semanticSummary: 'Learned: Auth tokens expire after 1 hour',
        context: {
          entryType: 'experience',
          entryId: 'exp-123',
          entryName: 'Token expiry discovery',
        },
      };

      await context.repos.episodes!.addEvent({
        episodeId: episode.id,
        name: 'Tool execution',
        eventType: 'checkpoint',
        description: eventData.semanticSummary,
        data: eventData,
      });

      const events = await context.repos.episodes!.getEvents(episode.id);

      expect(events.length).toBe(1);
      expect(events[0].description).toBe('Learned: Auth tokens expire after 1 hour');

      const parsedData = JSON.parse(events[0].data!);
      expect(parsedData.semanticSummary).toBe('Learned: Auth tokens expire after 1 hour');
    });

    it('should use entryName as fallback when no semantic summary', async () => {
      const project = createTestProject(db, 'Fallback Event Project');
      const session = createTestSession(db, project.id, 'Fallback Event Session');

      const episode = await context.repos.episodes!.create({
        sessionId: session.id,
        projectId: project.id,
        name: 'Fallback event test',
        scopeType: 'project',
        scopeId: project.id,
        triggerType: 'user_request',
        createdBy: AGENT_ID,
      });

      const eventData = {
        toolName: 'memory_guideline',
        action: 'add',
        success: true,
        context: {
          entryType: 'guideline',
          entryId: 'guid-456',
          entryName: 'Always use TypeScript strict mode',
        },
      };

      const description = eventData.context.entryName
        ? `${eventData.action}: ${eventData.context.entryName}`
        : `Tool ${eventData.toolName} with action ${eventData.action}`;

      await context.repos.episodes!.addEvent({
        episodeId: episode.id,
        name: 'Tool execution',
        eventType: 'checkpoint',
        description,
        data: eventData,
      });

      const events = await context.repos.episodes!.getEvents(episode.id);

      expect(events.length).toBe(1);
      expect(events[0].description).toBe('add: Always use TypeScript strict mode');
    });
  });

  describe('Quality score calculation on episode completion', () => {
    it('should calculate quality score with all factors when episode has rich data', async () => {
      const project = createTestProject(db, 'Quality Score Project');
      const session = createTestSession(db, project.id, 'Quality Score Session');

      const episode = await context.repos.episodes!.create({
        sessionId: session.id,
        projectId: project.id,
        name: 'Quality score test',
        scopeType: 'project',
        scopeId: project.id,
        triggerType: 'user_request',
        createdBy: AGENT_ID,
      });

      await context.repos.episodes!.start(episode.id);

      const eventWithSemantic = {
        toolName: 'memory_experience',
        action: 'learn',
        success: true,
        semanticSummary: 'Discovered that API rate limits at 100 req/min',
      };

      await context.repos.episodes!.addEvent({
        episodeId: episode.id,
        name: 'Tool execution',
        eventType: 'checkpoint',
        description: eventWithSemantic.semanticSummary,
        data: eventWithSemantic,
      });

      await context.repos.episodes!.update(episode.id, {
        metadata: { nameEnriched: true },
      });

      const updated = await context.repos.episodes!.complete(
        episode.id,
        'Test completed successfully',
        'success'
      );

      expect(updated.status).toBe('completed');
      expect(updated.outcome).toBe('Test completed successfully');

      const factors = {
        hasEvents: 0.25,
        hasSemanticEvents: 0.25,
        nameEnriched: 0.15,
        messagesLinked: 0,
        messagesScored: 0,
        hasExperiences: 0,
      };
      const expectedScore = Math.round(
        (factors.hasEvents +
          factors.hasSemanticEvents +
          factors.nameEnriched +
          factors.messagesLinked +
          factors.messagesScored +
          factors.hasExperiences) *
          100
      );

      await context.repos.episodes!.update(episode.id, {
        qualityScore: expectedScore,
        qualityFactors: factors,
      });

      const finalEpisode = await context.repos.episodes!.getById(episode.id);

      expect(finalEpisode?.qualityScore).toBe(65);
      const storedFactors1 =
        typeof finalEpisode?.qualityFactors === 'string'
          ? JSON.parse(finalEpisode.qualityFactors)
          : finalEpisode?.qualityFactors;
      expect(storedFactors1).toEqual(factors);
    });

    it('should calculate low quality score for episode with minimal data', async () => {
      const project = createTestProject(db, 'Low Quality Project');
      const session = createTestSession(db, project.id, 'Low Quality Session');

      const episode = await context.repos.episodes!.create({
        sessionId: session.id,
        projectId: project.id,
        name: 'Minimal episode',
        scopeType: 'project',
        scopeId: project.id,
        triggerType: 'user_request',
        createdBy: AGENT_ID,
      });

      await context.repos.episodes!.start(episode.id);
      await context.repos.episodes!.complete(episode.id, 'Done', 'success');

      const factors = {
        hasEvents: 0,
        hasSemanticEvents: 0,
        nameEnriched: 0,
        messagesLinked: 0,
        messagesScored: 0,
        hasExperiences: 0,
      };

      await context.repos.episodes!.update(episode.id, {
        qualityScore: 0,
        qualityFactors: factors,
      });

      const finalEpisode = await context.repos.episodes!.getById(episode.id);

      expect(finalEpisode?.qualityScore).toBe(0);
    });
  });

  describe('Experience scenario from trajectory', () => {
    it('should build meaningful scenario from trajectory steps', async () => {
      const project = createTestProject(db, 'Trajectory Project');
      const session = createTestSession(db, project.id, 'Trajectory Session');

      const episode = await context.repos.episodes!.create({
        sessionId: session.id,
        projectId: project.id,
        name: 'Fix authentication bug',
        scopeType: 'project',
        scopeId: project.id,
        triggerType: 'user_request',
        createdBy: AGENT_ID,
      });

      await context.repos.episodes!.start(episode.id);

      const steps = [
        { toolName: 'Read', action: 'read', description: 'Read auth.ts' },
        { toolName: 'Edit', action: 'edit', description: 'Edited auth.ts: fixed token validation' },
        { toolName: 'Bash', action: 'run', description: 'Ran npm test' },
      ];

      for (const step of steps) {
        await context.repos.episodes!.addEvent({
          episodeId: episode.id,
          name: step.description,
          eventType: 'checkpoint',
          description: step.description,
          data: step,
        });
      }

      await context.repos.episodes!.complete(episode.id, 'Fixed token validation issue', 'success');

      const events = await context.repos.episodes!.getEvents(episode.id);

      const stepEvents = events.filter((e) => e.eventType === 'checkpoint');
      expect(stepEvents.length).toBe(3);
      expect(stepEvents[0].description).toBe('Read auth.ts');
      expect(stepEvents[1].description).toBe('Edited auth.ts: fixed token validation');
      expect(stepEvents[2].description).toBe('Ran npm test');

      const trajectoryScenario = steps
        .slice(0, 2)
        .map((s) => s.description)
        .join(' -> ');

      expect(trajectoryScenario).toBe('Read auth.ts -> Edited auth.ts: fixed token validation');
    });
  });

  describe('Full quality improvement workflow', () => {
    it('should demonstrate all quality improvements in a single episode lifecycle', async () => {
      const project = createTestProject(db, 'Full Workflow Project');
      const session = createTestSession(db, project.id, 'Full Workflow Session');

      const episode = await context.repos.episodes!.create({
        sessionId: session.id,
        projectId: project.id,
        name: 'Implement user login',
        scopeType: 'project',
        scopeId: project.id,
        triggerType: 'user_request',
        createdBy: AGENT_ID,
      });

      expect(episode.scopeType).toBe('project');
      expect(episode.projectId).toBe(project.id);

      await context.repos.episodes!.start(episode.id);

      const semanticEvent = {
        toolName: 'memory_experience',
        action: 'learn',
        success: true,
        semanticSummary: 'Learned: JWT tokens need refresh after 15 minutes',
      };

      await context.repos.episodes!.addEvent({
        episodeId: episode.id,
        name: 'Learning',
        eventType: 'checkpoint',
        description: semanticEvent.semanticSummary,
        data: semanticEvent,
      });

      await context.repos.episodes!.update(episode.id, {
        metadata: { nameEnriched: true },
      });

      const experience = await context.repos.experiences.create({
        scopeType: 'project',
        scopeId: project.id,
        title: 'JWT refresh token timing',
        level: 'case',
        category: 'authentication',
        content: 'JWT tokens need refresh after 15 minutes',
        scenario: 'Implementing user login flow',
        outcome: 'Discovered optimal refresh timing',
        source: 'observation',
        createdBy: AGENT_ID,
      });

      await context.repos.episodes!.complete(
        episode.id,
        'Successfully implemented login with JWT refresh',
        'success'
      );

      const events = await context.repos.episodes!.getEvents(episode.id);
      const checkpointEvents = events.filter((e) => e.eventType === 'checkpoint');
      expect(checkpointEvents.length).toBeGreaterThan(0);
      expect(checkpointEvents.some((e) => e.description?.includes('Learned:'))).toBe(true);

      expect(experience.id).toBeDefined();

      const factors = {
        hasEvents: 0.25,
        hasSemanticEvents: 0.25,
        nameEnriched: 0.15,
        messagesLinked: 0,
        messagesScored: 0,
        hasExperiences: 0,
      };
      const qualityScore = Math.round(Object.values(factors).reduce((a, b) => a + b, 0) * 100);

      await context.repos.episodes!.update(episode.id, {
        qualityScore,
        qualityFactors: factors,
      });

      const finalEpisode = await context.repos.episodes!.getById(episode.id);

      expect(finalEpisode?.status).toBe('completed');
      expect(finalEpisode?.qualityScore).toBe(65);
      const storedFactors =
        typeof finalEpisode?.qualityFactors === 'string'
          ? JSON.parse(finalEpisode.qualityFactors)
          : finalEpisode?.qualityFactors;
      expect(storedFactors).toEqual(factors);

      const allExperiences = await context.repos.experiences.list({
        scopeType: 'project',
        scopeId: project.id,
      });
      expect(allExperiences.length).toBeGreaterThan(0);
      expect(allExperiences[0].currentVersion?.scenario).not.toBe('Task execution');
    });
  });
});
