import 'dotenv/config';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { config } from '../config/env.config.js';
import { prisma, disconnectDB } from '../config/db.config.js';
import { initSentry } from '../config/sentry.config.js';
import { createScheduledJobs } from '../constants/scheduler.constant.js';
import { BillingRepository } from '../repos/billing.repo.js';
import { SchedulerRepository } from '../repos/scheduler.repo.js';
import { BillingService } from '../services/billing.service.js';
import { SchedulerService } from '../services/scheduler.service.js';

initSentry();

const billingRepo = new BillingRepository(prisma);
const schedulerRepo = new SchedulerRepository(prisma);
const billingService = new BillingService(billingRepo, prisma);
const workerId = `${os.hostname()}:${process.pid}:${randomUUID()}`;
const requestedJobs =
  config.SCHEDULER_JOB_FILTER?.split(',')
    .map((jobId) => jobId.trim())
    .filter(Boolean) ?? [];
const availableJobs = createScheduledJobs({ billingService });
const availableJobIds = availableJobs.map((job) => job.id);
const jobs = requestedJobs.length
  ? availableJobs.filter((job) => requestedJobs.includes(job.id))
  : availableJobs;

const exitForUnknownJobFilter = (): never => {
  console.error('[Scheduler] No known jobs matched SCHEDULER_JOB_FILTER', {
    requestedJobIds: requestedJobs,
    availableJobIds,
  });
  process.exit(1);
};

if (requestedJobs.length > 0 && jobs.length === 0) {
  exitForUnknownJobFilter();
}

const schedulerService = new SchedulerService(schedulerRepo, {
  jobs,
  workerId,
  pollIntervalMs: config.SCHEDULER_POLL_INTERVAL_SECONDS * 1000,
});

let shuttingDown = false;
let idleInterval: NodeJS.Timeout | null = null;

const shutdown = async (signal: string) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[Scheduler] Received ${signal}, shutting down`);

  if (idleInterval) {
    clearInterval(idleInterval);
    idleInterval = null;
  }

  await schedulerService.stop();
  await disconnectDB();
  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

if (!config.SCHEDULER_ENABLED) {
  console.log('[Scheduler] Disabled by SCHEDULER_ENABLED=false');
  idleInterval = setInterval(() => {}, 60_000);
} else if (jobs.length === 0) {
  if (requestedJobs.length > 0) {
    exitForUnknownJobFilter();
  }
  console.log('[Scheduler] No jobs selected by SCHEDULER_JOB_FILTER');
  idleInterval = setInterval(() => {}, 60_000);
} else {
  await schedulerService.start();
  console.log('[Scheduler] started', {
    workerId,
    jobIds: jobs.map((job) => job.id),
    pollIntervalSeconds: config.SCHEDULER_POLL_INTERVAL_SECONDS,
  });
}
