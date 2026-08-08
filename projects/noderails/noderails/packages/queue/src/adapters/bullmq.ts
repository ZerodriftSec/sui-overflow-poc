/**
 * BullMQ Adapter
 * 
 * This adapter implements the queue abstraction using BullMQ.
 * To switch to a different queue backend, create a new adapter and update the factory.
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import type {
  IQueueAdapter,
  IWorkerAdapter,
  JobOptions,
  JobResult,
  JobContext,
  JobProcessor,
  JobStatus,
  WorkerOptions,
  WorkerEvents,
  QueueConnectionOptions,
} from '../interfaces.js';

/**
 * Convert our JobOptions to BullMQ JobsOptions
 */
function toBullMQJobOptions(options?: JobOptions): Record<string, unknown> {
  if (!options) return {};

  return {
    jobId: options.jobId,
    delay: options.delay,
    attempts: options.attempts,
    backoff: options.backoff,
    removeOnComplete: options.removeOnComplete,
    removeOnFail: options.removeOnFail,
    priority: options.priority,
    repeat: options.repeat,
  };
}

/**
 * Convert BullMQ job state to our JobStatus
 */
function toJobStatus(state: string): JobStatus {
  const statusMap: Record<string, JobStatus> = {
    waiting: 'waiting',
    active: 'active',
    completed: 'completed',
    failed: 'failed',
    delayed: 'delayed',
  };
  return statusMap[state] || 'waiting';
}

/**
 * Convert BullMQ Job to our JobResult
 */
function toJobResult<T>(job: Job<T>): JobResult<T> {
  return {
    id: job.id!,
    name: job.name,
    data: job.data,
    status: toJobStatus(job.id ? 'waiting' : 'completed'), // Simplified, actual state requires getState()
    timestamp: job.timestamp,
  };
}

/**
 * Create a Redis connection from options
 */
export function createRedisConnection(options: QueueConnectionOptions): Redis {
  if (options.redisUrl) {
    const isTls = options.redisUrl.startsWith('rediss://');
    return new Redis(options.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      ...(isTls && { tls: { rejectUnauthorized: true } }),
    });
  }

  return new Redis({
    host: options.host || 'localhost',
    port: options.port || 6379,
    password: options.password,
    db: options.db || 0,
    tls: options.tls ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

/**
 * BullMQ Queue Adapter
 */
export class BullMQAdapter<T = unknown> implements IQueueAdapter<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private queue: Queue<any, any, string>;
  private connection: Redis;

  constructor(
    public readonly name: string,
    options: QueueConnectionOptions = {}
  ) {
    this.connection = createRedisConnection(options);
    this.queue = new Queue(name, {
      connection: this.connection,
      prefix: options.prefix || 'noderails',
    });
  }

  async add(jobName: string, data: T, options?: JobOptions): Promise<JobResult<T>> {
    const job = await this.queue.add(jobName, data, toBullMQJobOptions(options));
    return toJobResult(job) as JobResult<T>;
  }

  async addBulk(
    jobs: Array<{ name: string; data: T; options?: JobOptions }>
  ): Promise<JobResult<T>[]> {
    const bullJobs = jobs.map((j) => ({
      name: j.name,
      data: j.data,
      opts: toBullMQJobOptions(j.options),
    }));
    const results = await this.queue.addBulk(bullJobs as any);
    return results.map((job) => toJobResult(job) as JobResult<T>);
  }

  async getJob(jobId: string): Promise<JobResult<T> | null> {
    const job = await this.queue.getJob(jobId);
    return job ? toJobResult(job) : null;
  }

  async getJobs(
    status: JobStatus | JobStatus[],
    start = 0,
    end = 100
  ): Promise<JobResult<T>[]> {
    const statuses = Array.isArray(status) ? status : [status];
    const jobs = await this.queue.getJobs(statuses as any, start, end);
    return jobs.map(toJobResult);
  }

  async getJobCounts(): Promise<Record<JobStatus, number>> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed'
    );
    return counts as Record<JobStatus, number>;
  }

  async removeJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }

  async pause(): Promise<void> {
    await this.queue.pause();
  }

  async resume(): Promise<void> {
    await this.queue.resume();
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }

  async drain(): Promise<void> {
    await this.queue.drain();
  }

  async obliterate(): Promise<void> {
    await this.queue.obliterate();
  }

  getUnderlyingQueue(): unknown {
    return this.queue;
  }
}

/**
 * BullMQ Worker Adapter
 */
export class BullMQWorkerAdapter<T = unknown> implements IWorkerAdapter<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private worker: Worker<any, any, string>;
  private connection: Redis;
  private running = false;

  constructor(
    public readonly name: string,
    processor: JobProcessor<T>,
    options: QueueConnectionOptions & WorkerOptions = {},
    events?: WorkerEvents<T>
  ) {
    this.connection = createRedisConnection(options);

    this.worker = new Worker(
      name,
      async (job: Job) => {
        const context = this.createJobContext(job as Job<T>);
        return processor(context);
      },
      {
        connection: this.connection,
        prefix: options.prefix || 'noderails',
        concurrency: options.concurrency || 1,
        lockDuration: options.lockDuration || 30000,
        stalledInterval: options.stalledInterval || 30000,
        maxStalledCount: options.maxStalledCount || 1,
      }
    );

    // Set up event handlers
    if (events?.onCompleted) {
      this.worker.on('completed', (job) => {
        events.onCompleted!(this.createJobContext(job as Job<T>), job.returnvalue);
      });
    }

    if (events?.onFailed) {
      this.worker.on('failed', (job, error) => {
        if (job) {
          events.onFailed!(this.createJobContext(job as Job<T>), error);
        }
      });
    }

    if (events?.onProgress) {
      this.worker.on('progress', (job, progress) => {
        events.onProgress!(this.createJobContext(job as Job<T>), progress as number);
      });
    }

    if (events?.onActive) {
      this.worker.on('active', (job) => {
        events.onActive!(this.createJobContext(job as Job<T>));
      });
    }

    if (events?.onStalled) {
      this.worker.on('stalled', (jobId) => {
        events.onStalled!(jobId);
      });
    }
  }

  private createJobContext(job: Job<T>): JobContext<T> {
    return {
      id: job.id!,
      name: job.name,
      data: job.data as T,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      progress: (value: number) => job.updateProgress(value),
      log: async (message: string) => { await job.log(message); },
      updateData: (data: Partial<T>) => job.updateData({ ...job.data, ...data } as T),
    };
  }

  get isRunning(): boolean {
    return this.running;
  }

  async run(): Promise<void> {
    this.running = true;
    // BullMQ worker starts processing automatically
  }

  async pause(): Promise<void> {
    await this.worker.pause();
    this.running = false;
  }

  async resume(): Promise<void> {
    this.worker.resume();
    this.running = true;
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
    this.running = false;
  }

  getUnderlyingWorker(): unknown {
    return this.worker;
  }
}
