import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { createComponentLogger } from '../../../utils/logger.js';
import type { MaintenanceRequest, MaintenanceResult, QueueConfig } from './types.js';
import { DEFAULT_QUEUE_CONFIG } from './types.js';
import type {
  IMaintenanceJobRepository,
  MaintenanceJobRecord,
} from '../../../db/repositories/maintenance-jobs.js';
import type { StoredJobProgress, StoredTaskProgress } from '../../../db/schema/maintenance-jobs.js';

const logger = createComponentLogger('maintenance-job-manager');

// Event types for job status updates
export interface JobEventMap {
  'job:created': { job: MaintenanceJob };
  'job:started': { job: MaintenanceJob };
  'job:task_progress': { jobId: string; taskName: string; task: MaintenanceTaskProgress };
  'job:completed': { job: MaintenanceJob; result: MaintenanceResult };
  'job:failed': { job: MaintenanceJob; error: string };
}

export type JobEventName = keyof JobEventMap;

export type MaintenanceJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface MaintenanceTaskProgress {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

export interface MaintenanceJob {
  id: string;
  status: MaintenanceJobStatus;
  request: MaintenanceRequest;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress: {
    currentTask?: string;
    completedTasks: number;
    totalTasks: number;
    tasks: MaintenanceTaskProgress[];
  };
  result?: MaintenanceResult;
  error?: string;
}

export interface JobManagerConfig {
  maxJobHistory: number;
  jobRetentionMs: number;
  maxConcurrentJobs: number;
  queue?: QueueConfig;
}

const DEFAULT_CONFIG: JobManagerConfig = {
  maxJobHistory: 100,
  jobRetentionMs: 60 * 60 * 1000,
  maxConcurrentJobs: 1,
  queue: DEFAULT_QUEUE_CONFIG,
};

const ALL_MAINTENANCE_TASKS = [
  'consolidation',
  'forgetting',
  'graphBackfill',
  'embeddingBackfill',
  'latentPopulation',
  'tagRefinement',
  'semanticEdgeInference',
  'toolTagAssignment',
  'embeddingCleanup',
  'messageRelevanceScoring',
  'experienceTitleImprovement',
  'messageInsightExtraction',
  'extractionQuality',
  'duplicateRefinement',
  'categoryAccuracy',
  'relevanceCalibration',
  'feedbackLoop',
] as const;

function parseJson<T>(json: string | null | undefined): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

type MaintenanceTaskName =
  | 'consolidation'
  | 'forgetting'
  | 'graphBackfill'
  | 'embeddingBackfill'
  | 'latentPopulation'
  | 'tagRefinement'
  | 'semanticEdgeInference'
  | 'toolTagAssignment'
  | 'embeddingCleanup'
  | 'messageRelevanceScoring'
  | 'experienceTitleImprovement'
  | 'messageInsightExtraction'
  | 'extractionQuality'
  | 'duplicateRefinement'
  | 'categoryAccuracy'
  | 'relevanceCalibration'
  | 'feedbackLoop';

function recordToJob(record: MaintenanceJobRecord): MaintenanceJob {
  const progress = parseJson<StoredJobProgress>(record.progress) ?? {
    completedTasks: 0,
    totalTasks: 0,
    tasks: [],
  };

  const parsedTasks = parseJson<string[]>(record.requestTasks);
  const typedTasks = parsedTasks as MaintenanceTaskName[] | undefined;

  const request: MaintenanceRequest = {
    scopeType: record.requestScopeType,
    scopeId: record.requestScopeId ?? undefined,
    tasks: typedTasks,
    dryRun: record.requestDryRun ?? undefined,
    initiatedBy: record.requestInitiatedBy ?? undefined,
    configOverrides: parseJson(record.requestConfigOverrides),
  };

  return {
    id: record.id,
    status: record.status,
    request,
    createdAt: record.createdAt,
    startedAt: record.startedAt ?? undefined,
    completedAt: record.completedAt ?? undefined,
    progress,
    result: parseJson<MaintenanceResult>(record.result),
    error: record.error ?? undefined,
  };
}

export type ExecuteCallback = (job: MaintenanceJob) => Promise<void>;

export class MaintenanceJobManager extends EventEmitter {
  private jobs: Map<string, MaintenanceJob> = new Map();
  private config: JobManagerConfig;
  private cleanupInterval?: NodeJS.Timeout;
  private repository: IMaintenanceJobRepository | null = null;
  private initialized = false;
  private executeCallback?: ExecuteCallback;

  constructor(config?: Partial<JobManagerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cleanupInterval = setInterval(() => {
      void this.cleanup();
    }, 60_000);
  }

  emit<K extends JobEventName>(event: K, data: JobEventMap[K]): boolean {
    return super.emit(event, data);
  }

  on<K extends JobEventName>(event: K, listener: (data: JobEventMap[K]) => void): this {
    return super.on(event, listener);
  }

  setRepository(repo: IMaintenanceJobRepository): void {
    this.repository = repo;
  }

  setExecuteCallback(callback: ExecuteCallback): void {
    this.executeCallback = callback;
  }

  private async invokeExecuteCallback(job: MaintenanceJob): Promise<void> {
    if (!this.executeCallback) {
      logger.warn({ jobId: job.id }, 'No execute callback set, job started but not executed');
      return;
    }

    try {
      await this.executeCallback(job);
    } catch (err) {
      logger.error({ jobId: job.id, err }, 'Execute callback failed');
      await this.failJob(job.id, err instanceof Error ? err.message : 'Execute callback failed');
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized || !this.repository) return;

    try {
      const runningJobs = await this.repository.list({ status: 'running' });
      const pendingJobs = await this.repository.list({ status: 'pending' });

      for (const record of [...runningJobs, ...pendingJobs]) {
        const job = recordToJob(record);
        this.jobs.set(job.id, job);
      }

      const recentCompleted = await this.repository.list({ status: 'completed' }, { limit: 20 });
      for (const record of recentCompleted) {
        const job = recordToJob(record);
        this.jobs.set(job.id, job);
      }

      for (const record of runningJobs) {
        logger.warn(
          { jobId: record.id },
          'Found orphaned running job from previous server instance'
        );
        await this.failJob(record.id, 'Server restarted while job was running');
      }

      this.initialized = true;
      logger.info(
        { running: runningJobs.length, pending: pendingJobs.length, orphaned: runningJobs.length },
        'Loaded existing jobs from database'
      );

      if (pendingJobs.length > 0) {
        setImmediate(() => {
          void this.processQueue().catch((err: unknown) => {
            logger.error({ err }, 'Failed to process queue after initialization');
          });
        });
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to load jobs from database, starting fresh');
      this.initialized = true;
    }
  }

  async createJob(request: MaintenanceRequest): Promise<MaintenanceJob> {
    const maxDepth = this.config.queue?.maxQueueDepth ?? DEFAULT_QUEUE_CONFIG.maxQueueDepth;
    const pendingCount = this.listJobs('pending').length;

    if (pendingCount >= maxDepth) {
      logger.warn({ pendingCount, maxDepth }, 'Queue depth limit reached, rejecting new job');
      throw new Error(`Queue depth limit reached (${pendingCount}/${maxDepth}). Try again later.`);
    }

    const warningThreshold = Math.floor(maxDepth * 0.8);
    if (pendingCount >= warningThreshold) {
      logger.warn({ pendingCount, maxDepth }, 'Queue depth approaching limit');
    }

    const id = `job_${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    const tasksToRun = request.tasks ?? [...ALL_MAINTENANCE_TASKS];

    const job: MaintenanceJob = {
      id,
      status: 'pending',
      request,
      createdAt: now,
      progress: {
        completedTasks: 0,
        totalTasks: tasksToRun.length,
        tasks: tasksToRun.map((name) => ({ name, status: 'pending' })),
      },
    };

    this.jobs.set(id, job);

    if (this.repository) {
      try {
        await this.repository.create({
          id,
          scopeType: request.scopeType,
          scopeId: request.scopeId,
          tasks: tasksToRun,
          dryRun: request.dryRun,
          initiatedBy: request.initiatedBy,
          configOverrides: request.configOverrides as Record<string, unknown> | undefined,
        });
      } catch (error) {
        logger.warn({ jobId: id, error }, 'Failed to persist job to database');
      }
    }

    logger.info({ jobId: id, tasks: tasksToRun }, 'Created maintenance job');
    this.enforceMaxHistory();
    this.emit('job:created', { job });
    return job;
  }

  getJob(id: string): MaintenanceJob | undefined {
    return this.jobs.get(id);
  }

  async getJobWithFallback(id: string): Promise<MaintenanceJob | undefined> {
    if (this.repository) {
      try {
        const record = await this.repository.getById(id);
        if (record) {
          const job = recordToJob(record);
          this.jobs.set(id, job);
          return job;
        }
      } catch (error) {
        logger.warn({ jobId: id, error }, 'Failed to load job from database');
      }
    }

    return this.jobs.get(id);
  }

  listJobs(status?: MaintenanceJobStatus): MaintenanceJob[] {
    const jobs = Array.from(this.jobs.values());
    if (status) {
      return jobs.filter((j) => j.status === status);
    }
    return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async listJobsWithFallback(status?: MaintenanceJobStatus): Promise<MaintenanceJob[]> {
    if (this.repository) {
      try {
        const records = await this.repository.list(status ? { status } : {}, { limit: 100 });
        for (const record of records) {
          this.jobs.set(record.id, recordToJob(record));
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to load jobs from database');
      }
    }

    return this.listJobs(status);
  }

  getRunningJobs(): MaintenanceJob[] {
    return this.listJobs('running');
  }

  canStartJob(): boolean {
    return this.getRunningJobs().length < this.config.maxConcurrentJobs;
  }

  async startJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }

    const now = new Date().toISOString();
    job.status = 'running';
    job.startedAt = now;

    if (this.repository) {
      try {
        await this.repository.update(id, { status: 'running', startedAt: now });
      } catch (error) {
        logger.warn({ jobId: id, error }, 'Failed to update job status in database');
      }
    }

    logger.info({ jobId: id }, 'Job started');
    this.emit('job:started', { job });
  }

  async updateTaskProgress(
    jobId: string,
    taskName: string,
    update: Partial<MaintenanceTaskProgress>
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const task = job.progress.tasks.find((t) => t.name === taskName);
    if (task) {
      Object.assign(task, update);

      if (update.status === 'running') {
        job.progress.currentTask = taskName;
        task.startedAt = new Date().toISOString();
      }

      if (
        update.status === 'completed' ||
        update.status === 'failed' ||
        update.status === 'skipped'
      ) {
        task.completedAt = new Date().toISOString();
        job.progress.completedTasks = job.progress.tasks.filter(
          (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'skipped'
        ).length;
      }
    }

    if (this.repository) {
      try {
        await this.repository.updateTaskProgress(
          jobId,
          taskName,
          update as Partial<StoredTaskProgress>
        );
      } catch (error) {
        logger.warn({ jobId, taskName, error }, 'Failed to update task progress in database');
      }
    }

    if (task) {
      this.emit('job:task_progress', { jobId, taskName, task });
    }
  }

  async completeJob(id: string, result: MaintenanceResult): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    const now = new Date().toISOString();
    job.status = 'completed';
    job.completedAt = now;
    job.result = result;
    job.progress.currentTask = undefined;

    if (this.repository) {
      try {
        await this.repository.update(id, {
          status: 'completed',
          completedAt: now,
          result: result as unknown as Record<string, unknown>,
          progress: job.progress as StoredJobProgress,
        });
      } catch (error) {
        logger.warn({ jobId: id, error }, 'Failed to update completed job in database');
      }
    }

    logger.info(
      {
        jobId: id,
        durationMs: result.timing.durationMs,
        completedTasks: job.progress.completedTasks,
      },
      'Job completed'
    );

    this.emit('job:completed', { job, result });

    setImmediate(() => {
      void this.processQueue().catch((err: unknown) => {
        logger.error({ err }, 'Failed to process queue after job completion');
      });
    });
  }

  async failJob(id: string, error: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    const now = new Date().toISOString();
    job.status = 'failed';
    job.completedAt = now;
    job.error = error;
    job.progress.currentTask = undefined;

    if (this.repository) {
      try {
        await this.repository.update(id, {
          status: 'failed',
          completedAt: now,
          error,
          progress: job.progress as StoredJobProgress,
        });
      } catch (error) {
        logger.warn({ jobId: id, error }, 'Failed to update failed job in database');
      }
    }

    logger.error({ jobId: id, error }, 'Job failed');

    this.emit('job:failed', { job, error });

    setImmediate(() => {
      void this.processQueue().catch((err: unknown) => {
        logger.error({ err }, 'Failed to process queue after job failure');
      });
    });
  }

  isJobExpired(job: MaintenanceJob): boolean {
    const expirationMs =
      this.config.queue?.pendingJobExpirationMs ?? DEFAULT_QUEUE_CONFIG.pendingJobExpirationMs;
    const createdAt = new Date(job.createdAt).getTime();
    return Date.now() - createdAt > expirationMs;
  }

  async cancelJob(id: string, reason: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'pending') return;

    const now = new Date().toISOString();
    job.status = 'failed';
    job.completedAt = now;
    job.error = reason;

    if (this.repository) {
      try {
        await this.repository.update(id, {
          status: 'failed',
          completedAt: now,
          error: reason,
        });
      } catch (error) {
        logger.warn({ jobId: id, error }, 'Failed to update cancelled job in database');
      }
    }

    logger.info({ jobId: id, reason }, 'Pending job cancelled');
  }

  getRecentCompletedJobs(windowMs?: number): MaintenanceJob[] {
    const window =
      windowMs ??
      this.config.queue?.deduplicationWindowMs ??
      DEFAULT_QUEUE_CONFIG.deduplicationWindowMs;
    const cutoff = Date.now() - window;

    return this.listJobs('completed').filter((job) => {
      const completedAt = job.completedAt ? new Date(job.completedAt).getTime() : 0;
      return completedAt >= cutoff;
    });
  }

  isJobCoveredByRecent(job: MaintenanceJob, recentJobs: MaintenanceJob[]): boolean {
    const jobTasks = new Set(job.progress.tasks.map((t) => t.name));

    for (const completed of recentJobs) {
      const completedTasks = new Set(
        completed.progress.tasks.filter((t) => t.status === 'completed').map((t) => t.name)
      );

      const allTasksCovered = [...jobTasks].every((task) => completedTasks.has(task));
      const sameScope =
        job.request.scopeType === completed.request.scopeType &&
        job.request.scopeId === completed.request.scopeId;

      if (allTasksCovered && sameScope) {
        return true;
      }
    }

    return false;
  }

  async attemptMerge(pendingJobs: MaintenanceJob[]): Promise<MaintenanceJob | null> {
    if (!(this.config.queue?.enableMerging ?? DEFAULT_QUEUE_CONFIG.enableMerging)) {
      return null;
    }

    const byScope = new Map<string, MaintenanceJob[]>();
    for (const job of pendingJobs) {
      const key = `${job.request.scopeType}:${job.request.scopeId ?? 'global'}`;
      const group = byScope.get(key) ?? [];
      group.push(job);
      byScope.set(key, group);
    }

    for (const [, jobs] of byScope) {
      const singleTaskJobs = jobs.filter((j) => j.progress.totalTasks === 1);
      if (singleTaskJobs.length < 2) continue;

      const tasks = singleTaskJobs.flatMap((j) => j.progress.tasks.map((t) => t.name));
      const uniqueTasks = [...new Set(tasks)] as Array<
        | 'consolidation'
        | 'forgetting'
        | 'graphBackfill'
        | 'embeddingBackfill'
        | 'latentPopulation'
        | 'tagRefinement'
        | 'semanticEdgeInference'
        | 'toolTagAssignment'
        | 'embeddingCleanup'
        | 'messageInsightExtraction'
        | 'messageRelevanceScoring'
        | 'experienceTitleImprovement'
        | 'extractionQuality'
        | 'duplicateRefinement'
        | 'categoryAccuracy'
        | 'relevanceCalibration'
        | 'feedbackLoop'
      >;

      const firstJob = singleTaskJobs[0];
      if (!firstJob) continue;

      const mergedJob = await this.createJob({
        scopeType: firstJob.request.scopeType,
        scopeId: firstJob.request.scopeId,
        tasks: uniqueTasks,
        initiatedBy: 'queue-merge',
      });

      for (const job of singleTaskJobs) {
        await this.cancelJob(job.id, `Merged into job ${mergedJob.id}`);
      }

      logger.info(
        { mergedJobId: mergedJob.id, originalCount: singleTaskJobs.length, tasks: uniqueTasks },
        'Merged pending single-task jobs'
      );

      return mergedJob;
    }

    return null;
  }

  async processQueue(): Promise<MaintenanceJob | null> {
    if (!this.canStartJob()) {
      logger.debug('Cannot start job: max concurrent jobs reached');
      return null;
    }

    const pendingJobs = this.listJobs('pending').sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    if (pendingJobs.length === 0) {
      logger.debug('No pending jobs to process');
      return null;
    }

    logger.info({ pendingCount: pendingJobs.length }, 'Processing job queue');

    const enableDeduplication =
      this.config.queue?.enableDeduplication ?? DEFAULT_QUEUE_CONFIG.enableDeduplication;
    const recentJobs = enableDeduplication ? this.getRecentCompletedJobs() : [];

    for (const job of pendingJobs) {
      if (this.isJobExpired(job)) {
        await this.cancelJob(job.id, 'Expired while pending');
        continue;
      }

      if (enableDeduplication && this.isJobCoveredByRecent(job, recentJobs)) {
        await this.cancelJob(job.id, 'Tasks already covered by recent job');
        continue;
      }

      const mergedJob = await this.attemptMerge(pendingJobs.filter((j) => j.id !== job.id));
      if (mergedJob) {
        logger.info({ jobId: mergedJob.id }, 'Auto-starting merged job from queue');
        await this.startJob(mergedJob.id);
        await this.invokeExecuteCallback(mergedJob);
        return mergedJob;
      }

      logger.info({ jobId: job.id }, 'Auto-starting pending job from queue');
      await this.startJob(job.id);
      await this.invokeExecuteCallback(job);
      return job;
    }

    logger.debug('No eligible pending jobs after filtering');
    return null;
  }

  getJobSummary(id: string): {
    id: string;
    status: MaintenanceJobStatus;
    progress: string;
    currentTask?: string;
    completedTasks: number;
    totalTasks: number;
    tasks: Array<{ name: string; status: string; result?: unknown }>;
    result?: MaintenanceResult;
    error?: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
  } | null {
    const job = this.jobs.get(id);
    if (!job) return null;

    return {
      id: job.id,
      status: job.status,
      progress: `${job.progress.completedTasks}/${job.progress.totalTasks} tasks`,
      currentTask: job.progress.currentTask,
      completedTasks: job.progress.completedTasks,
      totalTasks: job.progress.totalTasks,
      tasks: job.progress.tasks.map((t) => ({
        name: t.name,
        status: t.status,
        result: t.result,
      })),
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const cutoff = now - this.config.jobRetentionMs;

    for (const [id, job] of this.jobs) {
      if (job.status === 'completed' || job.status === 'failed') {
        const completedAt = job.completedAt ? new Date(job.completedAt).getTime() : 0;
        if (completedAt < cutoff) {
          this.jobs.delete(id);
          logger.debug({ jobId: id }, 'Cleaned up old job from memory');
        }
      }
    }

    const pendingJobs = this.listJobs('pending');
    let expiredCount = 0;
    for (const job of pendingJobs) {
      if (this.isJobExpired(job)) {
        await this.cancelJob(job.id, 'Expired while pending');
        expiredCount++;
      }
    }
    if (expiredCount > 0) {
      logger.info({ expiredCount }, 'Cancelled expired pending jobs during cleanup');
    }

    if (this.repository) {
      try {
        const cutoffDate = new Date(cutoff).toISOString();
        const deleted = await this.repository.deleteOlderThan(cutoffDate);
        if (deleted > 0) {
          logger.debug({ deleted }, 'Cleaned up old jobs from database');
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to clean up old jobs from database');
      }
    }
  }

  private enforceMaxHistory(): void {
    if (this.jobs.size <= this.config.maxJobHistory) return;

    const completedJobs = Array.from(this.jobs.entries())
      .filter(([, job]) => job.status === 'completed' || job.status === 'failed')
      .sort(([, a], [, b]) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const toRemove = this.jobs.size - this.config.maxJobHistory;
    for (let i = 0; i < toRemove && i < completedJobs.length; i++) {
      const entry = completedJobs[i];
      if (entry) {
        this.jobs.delete(entry[0]);
      }
    }
  }

  stop(): void {
    if (this.cleanupInterval !== undefined) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
}

let instance: MaintenanceJobManager | null = null;

export function getMaintenanceJobManager(): MaintenanceJobManager {
  if (!instance) {
    instance = new MaintenanceJobManager();
  }
  return instance;
}

export function resetMaintenanceJobManager(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
