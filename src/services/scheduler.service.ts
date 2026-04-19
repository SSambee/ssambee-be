import { CronExpressionParser } from 'cron-parser';
import { addSeconds } from 'date-fns';
import { SchedulerRepository } from '../repos/scheduler.repo.js';

export interface ScheduledJobContext {
  jobId: string;
  workerId: string;
  triggeredAt: Date;
  signal: AbortSignal;
}

export interface ScheduledJobDefinition {
  id: string;
  description: string;
  cron: string;
  timezone: string;
  leaseTtlSeconds: number;
  retryDelaySeconds: number;
  handler: (context: ScheduledJobContext) => Promise<void>;
}

interface SchedulerLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface SchedulerServiceOptions {
  jobs: ScheduledJobDefinition[];
  workerId: string;
  pollIntervalMs: number;
  logger?: SchedulerLogger;
}

export class SchedulerService {
  private readonly jobsById: Map<string, ScheduledJobDefinition>;
  private readonly runningJobs = new Map<
    string,
    {
      promise: Promise<void>;
      controller: AbortController;
    }
  >();
  private pollTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly schedulerRepo: SchedulerRepository,
    private readonly options: SchedulerServiceOptions,
  ) {
    this.jobsById = new Map(options.jobs.map((job) => [job.id, job]));
  }

  async start(now: Date = new Date()) {
    this.stopped = false;

    await this.initializeJobStates(now);
    this.scheduleNextPoll(0);
  }

  async stop() {
    this.stopped = true;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    const runningJobs = [...this.runningJobs.values()];

    for (const { controller } of runningJobs) {
      controller.abort();
    }

    await Promise.allSettled(runningJobs.map(({ promise }) => promise));
  }

  private static readonly MIN_HEARTBEAT_INTERVAL_MS = 250;

  private get logger(): SchedulerLogger {
    return this.options.logger ?? console;
  }

  private scheduleNextPoll(delayMs: number) {
    if (this.stopped) {
      return;
    }

    this.pollTimer = setTimeout(() => {
      void this.poll();
    }, delayMs);
  }

  private async initializeJobStates(now: Date) {
    await Promise.all(
      this.options.jobs.map((job) =>
        this.schedulerRepo.ensureJobState(
          job.id,
          this.buildScheduleFingerprint(job),
          this.calculateInitialNextRunAt(job, now),
        ),
      ),
    );
  }

  private async poll() {
    if (this.stopped) {
      return;
    }

    try {
      const now = new Date();
      const dueJobs = await this.schedulerRepo.listDueJobStates(
        [...this.jobsById.keys()],
        now,
      );

      for (const state of dueJobs) {
        const job = this.jobsById.get(state.jobName);

        if (!job || this.runningJobs.has(job.id)) {
          continue;
        }

        const controller = new AbortController();
        const promise = this.runJob(job, controller)
          .catch((error) => {
            this.logger.error('[SchedulerService] job crashed', {
              jobId: job.id,
              workerId: this.options.workerId,
              error: this.serializeError(error),
            });
          })
          .finally(() => {
            this.runningJobs.delete(job.id);
          });

        this.runningJobs.set(job.id, { promise, controller });
      }
    } catch (error) {
      this.logger.error('[SchedulerService] poll failed', {
        error: this.serializeError(error),
      });
    } finally {
      this.scheduleNextPoll(this.options.pollIntervalMs);
    }
  }

  private async runJob(
    job: ScheduledJobDefinition,
    abortController: AbortController,
  ) {
    const startedAt = new Date();
    const lockedUntil = addSeconds(startedAt, job.leaseTtlSeconds);
    const acquired = await this.schedulerRepo.tryAcquireLease(
      job.id,
      startedAt,
      this.options.workerId,
      lockedUntil,
    );

    if (!acquired) {
      return;
    }

    this.logger.info('[SchedulerService] job started', {
      jobId: job.id,
      workerId: this.options.workerId,
      triggeredAt: startedAt.toISOString(),
    });
    let leaseLost = false;
    const handleLeaseLoss = (error: unknown) => {
      if (leaseLost) {
        return;
      }

      leaseLost = true;
      abortController.abort(
        error instanceof Error ? error : new Error(String(error)),
      );
    };

    const heartbeatIntervalMs = this.calculateHeartbeatIntervalMs(
      job.leaseTtlSeconds,
    );

    const heartbeat = setInterval(() => {
      const heartbeatAt = new Date();
      void this.schedulerRepo
        .extendLease(
          job.id,
          this.options.workerId,
          heartbeatAt,
          addSeconds(heartbeatAt, job.leaseTtlSeconds),
        )
        .then((extended) => {
          if (!extended) {
            this.logger.warn('[SchedulerService] lease lost during heartbeat', {
              jobId: job.id,
              workerId: this.options.workerId,
            });
            handleLeaseLoss(new Error('Scheduler lease lost'));
          }
        })
        .catch((error) => {
          this.logger.error('[SchedulerService] heartbeat failed', {
            jobId: job.id,
            workerId: this.options.workerId,
            error: this.serializeError(error),
          });
          handleLeaseLoss(error);
        });
    }, heartbeatIntervalMs);

    try {
      await job.handler({
        jobId: job.id,
        workerId: this.options.workerId,
        triggeredAt: startedAt,
        signal: abortController.signal,
      });

      if (leaseLost) {
        this.logger.warn('[SchedulerService] job aborted after lease loss', {
          jobId: job.id,
          workerId: this.options.workerId,
        });
        return;
      }

      const finishedAt = new Date();
      const persisted = await this.schedulerRepo.markJobSucceeded(
        job.id,
        this.options.workerId,
        finishedAt,
        finishedAt,
        this.calculateNextRunAt(job, finishedAt),
      );

      if (!persisted) {
        this.logger.warn(
          '[SchedulerService] job completion state was not persisted',
          {
            jobId: job.id,
            workerId: this.options.workerId,
            finishedAt: finishedAt.toISOString(),
          },
        );
        return;
      }

      this.logger.info('[SchedulerService] job succeeded', {
        jobId: job.id,
        workerId: this.options.workerId,
        finishedAt: finishedAt.toISOString(),
      });
    } catch (error) {
      const finishedAt = new Date();
      const nextRunAt = addSeconds(finishedAt, job.retryDelaySeconds);
      const errorMessage = this.serializeError(error);

      if (leaseLost || this.isAbortError(error)) {
        this.logger.warn('[SchedulerService] job aborted after lease loss', {
          jobId: job.id,
          workerId: this.options.workerId,
          error: errorMessage,
        });
        return;
      }

      const persisted = await this.schedulerRepo.markJobFailed(
        job.id,
        this.options.workerId,
        finishedAt,
        finishedAt,
        nextRunAt,
        errorMessage,
      );

      if (!persisted) {
        this.logger.warn(
          '[SchedulerService] job failure state was not persisted',
          {
            jobId: job.id,
            workerId: this.options.workerId,
            finishedAt: finishedAt.toISOString(),
            error: errorMessage,
          },
        );
        return;
      }

      this.logger.error('[SchedulerService] job failed', {
        jobId: job.id,
        workerId: this.options.workerId,
        finishedAt: finishedAt.toISOString(),
        error: errorMessage,
      });
    } finally {
      clearInterval(heartbeat);
    }
  }

  private calculateInitialNextRunAt(job: ScheduledJobDefinition, now: Date) {
    return this.parseNextRun(job, new Date(now.getTime() - 1));
  }

  private calculateNextRunAt(job: ScheduledJobDefinition, now: Date) {
    return this.parseNextRun(job, now);
  }

  private parseNextRun(job: ScheduledJobDefinition, currentDate: Date) {
    return CronExpressionParser.parse(job.cron, {
      currentDate,
      tz: job.timezone,
    })
      .next()
      .toDate();
  }

  private buildScheduleFingerprint(job: ScheduledJobDefinition) {
    return `${job.cron}|${job.timezone}`;
  }

  private calculateHeartbeatIntervalMs(leaseTtlSeconds: number) {
    const leaseTtlMs = leaseTtlSeconds * 1000;

    return Math.max(
      SchedulerService.MIN_HEARTBEAT_INTERVAL_MS,
      Math.min(Math.floor(leaseTtlMs / 2), 30_000),
    );
  }

  private isAbortError(error: unknown) {
    if (error instanceof Error) {
      return error.name === 'AbortError';
    }

    return (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'AbortError'
    );
  }

  private serializeError(error: unknown) {
    if (error instanceof Error) {
      return error.stack ?? error.message;
    }

    return String(error);
  }
}
