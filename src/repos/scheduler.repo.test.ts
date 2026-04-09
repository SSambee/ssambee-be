import { SchedulerRepository } from './scheduler.repo.js';

describe('SchedulerRepository', () => {
  const scheduledJobStateCreate = jest.fn();
  const scheduledJobStateFindMany = jest.fn();
  const scheduledJobStateUpdateMany = jest.fn();
  const scheduledJobStateFindUnique = jest.fn();
  const scheduledJobStateUpdate = jest.fn();

  const prisma = {
    scheduledJobState: {
      create: scheduledJobStateCreate,
      findMany: scheduledJobStateFindMany,
      updateMany: scheduledJobStateUpdateMany,
      findUnique: scheduledJobStateFindUnique,
      update: scheduledJobStateUpdate,
    },
  } as never;

  let repo: SchedulerRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new SchedulerRepository(prisma);
  });

  it('ensureJobState는 row가 없으면 새 상태를 생성해야 한다', async () => {
    const nextRunAt = new Date('2026-04-09T15:05:00.000Z');
    scheduledJobStateFindUnique.mockResolvedValue(null);

    await repo.ensureJobState(
      'billing-reconcile',
      '5 0 * * *|Asia/Seoul',
      nextRunAt,
    );

    expect(scheduledJobStateFindUnique).toHaveBeenCalledWith({
      where: { jobName: 'billing-reconcile' },
    });
    expect(scheduledJobStateCreate).toHaveBeenCalledWith({
      data: {
        jobName: 'billing-reconcile',
        scheduleFingerprint: '5 0 * * *|Asia/Seoul',
        nextRunAt,
      },
    });
  });

  it('ensureJobState는 fingerprint가 같으면 기존 row를 유지해야 한다', async () => {
    const existing = {
      jobName: 'billing-reconcile',
      scheduleFingerprint: '5 0 * * *|Asia/Seoul',
      nextRunAt: new Date('2026-04-09T15:05:00.000Z'),
    };
    scheduledJobStateFindUnique.mockResolvedValue(existing);

    const result = await repo.ensureJobState(
      'billing-reconcile',
      '5 0 * * *|Asia/Seoul',
      new Date('2026-04-09T15:10:00.000Z'),
    );

    expect(scheduledJobStateUpdate).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it('ensureJobState는 fingerprint가 바뀌면 nextRunAt을 새 스케줄로 갱신해야 한다', async () => {
    const nextRunAt = new Date('2026-04-09T15:10:00.000Z');
    scheduledJobStateFindUnique.mockResolvedValue({
      jobName: 'billing-reconcile',
      scheduleFingerprint: '5 0 * * *|Asia/Seoul',
      nextRunAt: new Date('2026-04-10T15:05:00.000Z'),
    });

    await repo.ensureJobState(
      'billing-reconcile',
      '*/10 * * * *|Asia/Seoul',
      nextRunAt,
    );

    expect(scheduledJobStateUpdate).toHaveBeenCalledWith({
      where: { jobName: 'billing-reconcile' },
      data: {
        scheduleFingerprint: '*/10 * * * *|Asia/Seoul',
        nextRunAt,
      },
    });
  });

  it('listDueJobStates는 due + lease 만료 조건만 조회해야 한다', async () => {
    const now = new Date('2026-04-09T15:05:00.000Z');

    await repo.listDueJobStates(['billing-reconcile'], now);

    expect(scheduledJobStateFindMany).toHaveBeenCalledWith({
      where: {
        jobName: {
          in: ['billing-reconcile'],
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
              lt: now,
            },
          },
        ],
      },
      orderBy: { nextRunAt: 'asc' },
    });
  });

  it('tryAcquireLease는 lease를 잡지 못하면 null을 반환해야 한다', async () => {
    scheduledJobStateUpdateMany.mockResolvedValue({ count: 0 });

    const result = await repo.tryAcquireLease(
      'billing-reconcile',
      new Date('2026-04-09T15:05:00.000Z'),
      'worker-1',
      new Date('2026-04-09T15:10:00.000Z'),
    );

    expect(result).toBeNull();
    expect(scheduledJobStateFindUnique).not.toHaveBeenCalled();
  });

  it('tryAcquireLease는 조건이 맞으면 lastStartedAt과 lease를 갱신해야 한다', async () => {
    const now = new Date('2026-04-09T15:05:00.000Z');
    const lockedUntil = new Date('2026-04-09T15:10:00.000Z');
    const state = {
      jobName: 'billing-reconcile',
      nextRunAt: new Date('2026-04-09T15:05:00.000Z'),
      lockedBy: 'worker-1',
      lockedUntil,
    };

    scheduledJobStateUpdateMany.mockResolvedValue({ count: 1 });
    scheduledJobStateFindUnique.mockResolvedValue(state);

    const result = await repo.tryAcquireLease(
      'billing-reconcile',
      now,
      'worker-1',
      lockedUntil,
    );

    expect(scheduledJobStateUpdateMany).toHaveBeenCalledWith({
      where: {
        jobName: 'billing-reconcile',
        nextRunAt: {
          lte: now,
        },
        OR: [
          {
            lockedUntil: null,
          },
          {
            lockedUntil: {
              lt: now,
            },
          },
        ],
      },
      data: {
        lockedBy: 'worker-1',
        lockedUntil,
        lastStartedAt: now,
        lastError: null,
      },
    });
    expect(scheduledJobStateFindUnique).toHaveBeenCalledWith({
      where: { jobName: 'billing-reconcile' },
    });
    expect(result).toBe(state);
  });

  it('extendLease는 동일 worker가 잡은 lease만 연장해야 한다', async () => {
    const lockedUntil = new Date('2026-04-09T15:10:00.000Z');
    scheduledJobStateUpdateMany.mockResolvedValue({ count: 1 });

    const result = await repo.extendLease(
      'billing-reconcile',
      'worker-1',
      lockedUntil,
    );

    expect(scheduledJobStateUpdateMany).toHaveBeenCalledWith({
      where: {
        jobName: 'billing-reconcile',
        lockedBy: 'worker-1',
      },
      data: {
        lockedUntil,
      },
    });
    expect(result).toBe(true);
  });

  it('markJobSucceeded는 다음 실행 시각을 저장하고 lock을 해제해야 한다', async () => {
    const finishedAt = new Date('2026-04-09T15:05:01.000Z');
    const nextRunAt = new Date('2026-04-10T15:05:00.000Z');
    scheduledJobStateUpdateMany.mockResolvedValue({ count: 1 });

    const result = await repo.markJobSucceeded(
      'billing-reconcile',
      'worker-1',
      finishedAt,
      nextRunAt,
    );

    expect(scheduledJobStateUpdateMany).toHaveBeenCalledWith({
      where: {
        jobName: 'billing-reconcile',
        lockedBy: 'worker-1',
      },
      data: {
        nextRunAt,
        lastFinishedAt: finishedAt,
        lastSucceededAt: finishedAt,
        lockedBy: null,
        lockedUntil: null,
      },
    });
    expect(result).toBe(true);
  });

  it('markJobFailed는 에러와 재시도 시각을 저장하고 lock을 해제해야 한다', async () => {
    const finishedAt = new Date('2026-04-09T15:05:01.000Z');
    const nextRunAt = new Date('2026-04-09T15:10:01.000Z');
    scheduledJobStateUpdateMany.mockResolvedValue({ count: 1 });

    const result = await repo.markJobFailed(
      'billing-reconcile',
      'worker-1',
      finishedAt,
      nextRunAt,
      'boom',
    );

    expect(scheduledJobStateUpdateMany).toHaveBeenCalledWith({
      where: {
        jobName: 'billing-reconcile',
        lockedBy: 'worker-1',
      },
      data: {
        nextRunAt,
        lastFinishedAt: finishedAt,
        lastFailedAt: finishedAt,
        lastError: 'boom',
        lockedBy: null,
        lockedUntil: null,
      },
    });
    expect(result).toBe(true);
  });
});
