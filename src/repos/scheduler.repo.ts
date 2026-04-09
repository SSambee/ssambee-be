import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma, ScheduledJobState } from '../generated/prisma/client.js';

export class SchedulerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  async ensureJobState(
    jobName: string,
    scheduleFingerprint: string,
    nextRunAt: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const client = this.getClient(tx);
    const existing = await client.scheduledJobState.findUnique({
      where: { jobName },
    });

    if (!existing) {
      try {
        return await client.scheduledJobState.create({
          data: {
            jobName,
            scheduleFingerprint,
            nextRunAt,
          },
        });
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'P2002'
        ) {
          return client.scheduledJobState.findUnique({
            where: { jobName },
          });
        }

        throw error;
      }
    }

    if (existing.scheduleFingerprint === scheduleFingerprint) {
      return existing;
    }

    return client.scheduledJobState.update({
      where: { jobName },
      data: {
        scheduleFingerprint,
        nextRunAt,
      },
    });
  }

  async listDueJobStates(
    jobNames: string[],
    now: Date,
    tx?: Prisma.TransactionClient,
  ) {
    if (jobNames.length === 0) {
      return [];
    }

    return this.getClient(tx).scheduledJobState.findMany({
      where: {
        jobName: {
          in: jobNames,
        },
        nextRunAt: {
          lte: now,
        },
        OR: [
          {
            lockedUntil: null,
          },
          {
            lockedUntil: {
              lte: now,
            },
          },
        ],
      },
      orderBy: { nextRunAt: 'asc' },
    });
  }

  async tryAcquireLease(
    jobName: string,
    now: Date,
    lockedBy: string,
    lockedUntil: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<ScheduledJobState | null> {
    const result = await this.getClient(tx).scheduledJobState.updateMany({
      where: {
        jobName,
        nextRunAt: {
          lte: now,
        },
        OR: [
          {
            lockedUntil: null,
          },
          {
            lockedUntil: {
              lte: now,
            },
          },
        ],
      },
      data: {
        lockedBy,
        lockedUntil,
        lastStartedAt: now,
        lastError: null,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return this.getClient(tx).scheduledJobState.findUnique({
      where: { jobName },
    });
  }

  async extendLease(
    jobName: string,
    lockedBy: string,
    now: Date,
    lockedUntil: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const result = await this.getClient(tx).scheduledJobState.updateMany({
      where: {
        jobName,
        lockedBy,
        lockedUntil: {
          gt: now,
        },
      },
      data: {
        lockedUntil,
      },
    });

    return result.count > 0;
  }

  async markJobSucceeded(
    jobName: string,
    lockedBy: string,
    now: Date,
    finishedAt: Date,
    nextRunAt: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const result = await this.getClient(tx).scheduledJobState.updateMany({
      where: {
        jobName,
        lockedBy,
        lockedUntil: {
          gt: now,
        },
      },
      data: {
        nextRunAt,
        lastFinishedAt: finishedAt,
        lastSucceededAt: finishedAt,
        lockedBy: null,
        lockedUntil: null,
      },
    });

    return result.count > 0;
  }

  async markJobFailed(
    jobName: string,
    lockedBy: string,
    now: Date,
    finishedAt: Date,
    nextRunAt: Date,
    errorMessage: string,
    tx?: Prisma.TransactionClient,
  ) {
    const result = await this.getClient(tx).scheduledJobState.updateMany({
      where: {
        jobName,
        lockedBy,
        lockedUntil: {
          gt: now,
        },
      },
      data: {
        nextRunAt,
        lastFinishedAt: finishedAt,
        lastFailedAt: finishedAt,
        lastError: errorMessage,
        lockedBy: null,
        lockedUntil: null,
      },
    });

    return result.count > 0;
  }
}
