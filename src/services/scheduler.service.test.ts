import {
  SchedulerService,
  type ScheduledJobDefinition,
} from './scheduler.service.js';
import type { SchedulerRepository } from '../repos/scheduler.repo.js';

describe('SchedulerService', () => {
  const ensureJobState = jest.fn();
  const listDueJobStates = jest.fn();
  const tryAcquireLease = jest.fn();
  const extendLease = jest.fn();
  const markJobSucceeded = jest.fn();
  const markJobFailed = jest.fn();
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const repo = {
    ensureJobState,
    listDueJobStates,
    tryAcquireLease,
    extendLease,
    markJobSucceeded,
    markJobFailed,
  } as unknown as SchedulerRepository;

  const createJob = (
    overrides: Partial<ScheduledJobDefinition> = {},
  ): ScheduledJobDefinition => ({
    id: 'billing-reconcile',
    description: 'Expire entitlements and recharge credits',
    cron: '5 0 * * *',
    timezone: 'Asia/Seoul',
    leaseTtlSeconds: 20,
    retryDelaySeconds: 300,
    handler: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    ensureJobState.mockResolvedValue(undefined);
    listDueJobStates.mockResolvedValue([]);
    tryAcquireLease.mockResolvedValue(null);
    extendLease.mockResolvedValue(true);
    markJobSucceeded.mockResolvedValue(true);
    markJobFailed.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('start는 cron + timezone 기준 최초 nextRunAt을 초기화해야 한다', async () => {
    const service = new SchedulerService(repo, {
      jobs: [createJob()],
      workerId: 'worker-1',
      pollIntervalMs: 15_000,
      logger,
    });
    const now = new Date('2026-04-09T14:00:00.000Z');

    await service.start(now);
    await service.stop();

    expect(ensureJobState).toHaveBeenCalledWith(
      'billing-reconcile',
      '5 0 * * *|Asia/Seoul',
      new Date('2026-04-09T15:05:00.000Z'),
    );
  });

  it('due job은 lease 획득 후 handler를 실행하고 성공 시 다음 미래 스케줄로 갱신해야 한다', async () => {
    jest.setSystemTime(new Date('2026-04-09T15:05:00.000Z'));

    const handler = jest.fn().mockResolvedValue(undefined);
    const service = new SchedulerService(repo, {
      jobs: [createJob({ handler })],
      workerId: 'worker-1',
      pollIntervalMs: 15_000,
      logger,
    });

    listDueJobStates.mockResolvedValue([
      {
        jobName: 'billing-reconcile',
      },
    ]);
    tryAcquireLease.mockResolvedValue({
      jobName: 'billing-reconcile',
    });

    await service.start(new Date('2026-04-09T14:00:00.000Z'));
    await jest.advanceTimersByTimeAsync(0);
    await service.stop();

    expect(tryAcquireLease).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      jobId: 'billing-reconcile',
      workerId: 'worker-1',
      triggeredAt: new Date('2026-04-09T15:05:00.000Z'),
      signal: expect.any(AbortSignal),
    });
    expect(markJobSucceeded).toHaveBeenCalledWith(
      'billing-reconcile',
      'worker-1',
      expect.any(Date),
      new Date('2026-04-10T15:05:00.000Z'),
    );
    expect(markJobFailed).not.toHaveBeenCalled();
  });

  it('실행 중인 동일 job은 다음 poll에서 중복 실행하지 않아야 한다', async () => {
    jest.setSystemTime(new Date('2026-04-09T15:05:00.000Z'));

    let resolveHandler: (() => void) | null = null;
    const handler = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve;
        }),
    );
    const service = new SchedulerService(repo, {
      jobs: [createJob({ handler })],
      workerId: 'worker-1',
      pollIntervalMs: 15_000,
      logger,
    });

    listDueJobStates.mockResolvedValue([
      {
        jobName: 'billing-reconcile',
      },
    ]);
    tryAcquireLease.mockResolvedValue({
      jobName: 'billing-reconcile',
    });

    await service.start(new Date('2026-04-09T14:00:00.000Z'));
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(15_000);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(tryAcquireLease).toHaveBeenCalledTimes(1);

    resolveHandler?.();
    await Promise.resolve();
    await service.stop();
  });

  it('긴 실행 중에는 heartbeat로 lease를 연장해야 한다', async () => {
    jest.setSystemTime(new Date('2026-04-09T15:05:00.000Z'));

    let resolveHandler: (() => void) | null = null;
    const handler = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve;
        }),
    );
    const service = new SchedulerService(repo, {
      jobs: [createJob({ handler })],
      workerId: 'worker-1',
      pollIntervalMs: 15_000,
      logger,
    });

    listDueJobStates.mockResolvedValue([
      {
        jobName: 'billing-reconcile',
      },
    ]);
    tryAcquireLease.mockResolvedValue({
      jobName: 'billing-reconcile',
    });

    await service.start(new Date('2026-04-09T14:00:00.000Z'));
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(extendLease).toHaveBeenCalledWith(
      'billing-reconcile',
      'worker-1',
      new Date('2026-04-09T15:05:30.000Z'),
    );

    resolveHandler?.();
    await Promise.resolve();
    await service.stop();
  });

  it('lease ttl이 짧아도 첫 heartbeat는 lease 만료 전에 실행되어야 한다', async () => {
    jest.setSystemTime(new Date('2026-04-09T15:05:00.000Z'));

    let resolveHandler: (() => void) | null = null;
    const handler = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve;
        }),
    );
    const service = new SchedulerService(repo, {
      jobs: [createJob({ handler, leaseTtlSeconds: 5 })],
      workerId: 'worker-1',
      pollIntervalMs: 15_000,
      logger,
    });

    listDueJobStates.mockResolvedValue([
      {
        jobName: 'billing-reconcile',
      },
    ]);
    tryAcquireLease.mockResolvedValue({
      jobName: 'billing-reconcile',
    });

    await service.start(new Date('2026-04-09T14:00:00.000Z'));
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(2_500);

    expect(extendLease).toHaveBeenCalledWith(
      'billing-reconcile',
      'worker-1',
      new Date('2026-04-09T15:05:07.500Z'),
    );

    resolveHandler?.();
    await Promise.resolve();
    await service.stop();
  });

  it('runJob 내부 예외는 로깅하고 프로세스 전파를 막아야 한다', async () => {
    jest.setSystemTime(new Date('2026-04-09T15:05:00.000Z'));

    const service = new SchedulerService(repo, {
      jobs: [createJob()],
      workerId: 'worker-1',
      pollIntervalMs: 15_000,
      logger,
    });

    listDueJobStates.mockResolvedValue([
      {
        jobName: 'billing-reconcile',
      },
    ]);
    tryAcquireLease.mockRejectedValue(new Error('db down'));

    await service.start(new Date('2026-04-09T14:00:00.000Z'));
    await jest.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await service.stop();

    expect(logger.error).toHaveBeenCalledWith(
      '[SchedulerService] job crashed',
      expect.objectContaining({
        jobId: 'billing-reconcile',
        workerId: 'worker-1',
        error: expect.stringContaining('db down'),
      }),
    );
  });

  it('lease 연장에 실패하면 handler를 abort하고 성공 처리하지 않아야 한다', async () => {
    jest.setSystemTime(new Date('2026-04-09T15:05:00.000Z'));

    const handler = jest.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<void>((resolve, reject) => {
          signal.addEventListener('abort', () => {
            const fallbackError = new Error('Operation aborted');
            fallbackError.name = 'AbortError';
            reject(signal.reason ?? fallbackError);
          });
        }),
    );
    const service = new SchedulerService(repo, {
      jobs: [createJob({ handler })],
      workerId: 'worker-1',
      pollIntervalMs: 15_000,
      logger,
    });

    listDueJobStates.mockResolvedValue([
      {
        jobName: 'billing-reconcile',
      },
    ]);
    tryAcquireLease.mockResolvedValue({
      jobName: 'billing-reconcile',
    });
    extendLease.mockResolvedValue(false);

    await service.start(new Date('2026-04-09T14:00:00.000Z'));
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(10_000);
    await Promise.resolve();
    await service.stop();

    expect(markJobSucceeded).not.toHaveBeenCalled();
    expect(markJobFailed).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      '[SchedulerService] lease lost during heartbeat',
      expect.objectContaining({
        jobId: 'billing-reconcile',
        workerId: 'worker-1',
      }),
    );
  });

  it('상태 저장이 반영되지 않으면 성공 로그를 남기지 않아야 한다', async () => {
    jest.setSystemTime(new Date('2026-04-09T15:05:00.000Z'));

    const handler = jest.fn().mockResolvedValue(undefined);
    const service = new SchedulerService(repo, {
      jobs: [createJob({ handler })],
      workerId: 'worker-1',
      pollIntervalMs: 15_000,
      logger,
    });

    listDueJobStates.mockResolvedValue([
      {
        jobName: 'billing-reconcile',
      },
    ]);
    tryAcquireLease.mockResolvedValue({
      jobName: 'billing-reconcile',
    });
    markJobSucceeded.mockResolvedValue(false);

    await service.start(new Date('2026-04-09T14:00:00.000Z'));
    await jest.advanceTimersByTimeAsync(0);
    await service.stop();

    expect(logger.warn).toHaveBeenCalledWith(
      '[SchedulerService] job completion state was not persisted',
      expect.objectContaining({
        jobId: 'billing-reconcile',
        workerId: 'worker-1',
      }),
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      '[SchedulerService] job succeeded',
      expect.anything(),
    );
  });

  it('실패 상태 저장이 반영되지 않으면 실패 로그를 남기지 않아야 한다', async () => {
    jest.setSystemTime(new Date('2026-04-09T15:05:00.000Z'));

    const handler = jest.fn().mockRejectedValue(new Error('boom'));
    const service = new SchedulerService(repo, {
      jobs: [createJob({ handler })],
      workerId: 'worker-1',
      pollIntervalMs: 15_000,
      logger,
    });

    listDueJobStates.mockResolvedValue([
      {
        jobName: 'billing-reconcile',
      },
    ]);
    tryAcquireLease.mockResolvedValue({
      jobName: 'billing-reconcile',
    });
    markJobFailed.mockResolvedValue(false);

    await service.start(new Date('2026-04-09T14:00:00.000Z'));
    await jest.advanceTimersByTimeAsync(0);
    await service.stop();

    expect(logger.warn).toHaveBeenCalledWith(
      '[SchedulerService] job failure state was not persisted',
      expect.objectContaining({
        jobId: 'billing-reconcile',
        workerId: 'worker-1',
      }),
    );
    expect(logger.error).not.toHaveBeenCalledWith(
      '[SchedulerService] job failed',
      expect.anything(),
    );
  });

  it('stop 후에는 새 poll을 시작하지 않아야 한다', async () => {
    jest.setSystemTime(new Date('2026-04-09T15:05:00.000Z'));

    let resolveHandler: (() => void) | null = null;
    const handler = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve;
        }),
    );
    const service = new SchedulerService(repo, {
      jobs: [createJob({ handler })],
      workerId: 'worker-1',
      pollIntervalMs: 15_000,
      logger,
    });

    listDueJobStates.mockResolvedValue([
      {
        jobName: 'billing-reconcile',
      },
    ]);
    tryAcquireLease.mockResolvedValue({
      jobName: 'billing-reconcile',
    });

    await service.start(new Date('2026-04-09T14:00:00.000Z'));
    await jest.advanceTimersByTimeAsync(0);

    const stopPromise = service.stop();
    await jest.advanceTimersByTimeAsync(30_000);

    resolveHandler?.();
    await stopPromise;

    expect(listDueJobStates).toHaveBeenCalledTimes(1);
  });
});
