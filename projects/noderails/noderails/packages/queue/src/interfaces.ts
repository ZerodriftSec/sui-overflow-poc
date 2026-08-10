/**
 * Queue abstraction interfaces
 * 
 * These interfaces define the contract that any queue implementation must follow.
 * This allows swapping out BullMQ for another queue system without changing service code.
 */

/**
 * Job status
 */
export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

/**
 * Job options when adding to queue
 */
export interface JobOptions {
  /** Unique job ID (optional, will be generated if not provided) */
  jobId?: string;
  
  /** Delay before job becomes available (in milliseconds) */
  delay?: number;
  
  /** Number of retry attempts on failure */
  attempts?: number;
  
  /** Backoff strategy for retries */
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number; // Base delay in ms
  };
  
  /** Remove job from queue after completion */
  removeOnComplete?: boolean | number; // number = keep last N completed jobs
  
  /** Remove job from queue after failure */
  removeOnFail?: boolean | number;
  
  /** Job priority (lower = higher priority) */
  priority?: number;
  
  /** Repeat job on schedule */
  repeat?: {
    pattern?: string; // Cron pattern
    every?: number;   // Repeat every N milliseconds
    limit?: number;   // Max number of times to repeat
  };
}

/**
 * Job result returned after adding to queue
 */
export interface JobResult<T = unknown> {
  id: string;
  name: string;
  data: T;
  status: JobStatus;
  timestamp: number;
}

/**
 * Job context passed to worker processors
 */
export interface JobContext<T = unknown> {
  id: string;
  name: string;
  data: T;
  attemptsMade: number;
  timestamp: number;
  
  /** Report progress (0-100) */
  progress(value: number): Promise<void>;
  
  /** Log message for job */
  log(message: string): Promise<void>;
  
  /** Update job data */
  updateData(data: Partial<T>): Promise<void>;
}

/**
 * Job processor function type
 */
export type JobProcessor<T = unknown, R = unknown> = (job: JobContext<T>) => Promise<R>;

/**
 * Worker options
 */
export interface WorkerOptions {
  /** Number of concurrent jobs to process */
  concurrency?: number;
  
  /** Lock duration in ms (how long a job can be processing before considered stalled) */
  lockDuration?: number;
  
  /** How often to check for stalled jobs (ms) */
  stalledInterval?: number;
  
  /** Max stalled count before job is moved to failed */
  maxStalledCount?: number;
}

/**
 * Worker event handlers
 */
export interface WorkerEvents<T = unknown> {
  onCompleted?: (job: JobContext<T>, result: unknown) => void;
  onFailed?: (job: JobContext<T>, error: Error) => void;
  onProgress?: (job: JobContext<T>, progress: number) => void;
  onActive?: (job: JobContext<T>) => void;
  onStalled?: (jobId: string) => void;
}

/**
 * Queue interface - for adding jobs
 */
export interface IQueue<T = unknown> {
  /** Queue name */
  readonly name: string;
  
  /** Add a job to the queue */
  add(name: string, data: T, options?: JobOptions): Promise<JobResult<T>>;
  
  /** Add multiple jobs at once */
  addBulk(jobs: Array<{ name: string; data: T; options?: JobOptions }>): Promise<JobResult<T>[]>;
  
  /** Get a job by ID */
  getJob(jobId: string): Promise<JobResult<T> | null>;
  
  /** Get jobs by status */
  getJobs(status: JobStatus | JobStatus[], start?: number, end?: number): Promise<JobResult<T>[]>;
  
  /** Get job counts by status */
  getJobCounts(): Promise<Record<JobStatus, number>>;
  
  /** Remove a job by ID */
  removeJob(jobId: string): Promise<void>;
  
  /** Pause the queue */
  pause(): Promise<void>;
  
  /** Resume the queue */
  resume(): Promise<void>;
  
  /** Close the queue connection */
  close(): Promise<void>;
  
  /** Drain the queue (remove all waiting jobs) */
  drain(): Promise<void>;
  
  /** Obliterate the queue (remove all jobs and data) */
  obliterate(): Promise<void>;
}

/**
 * Worker interface - for processing jobs
 */
export interface IWorker<T = unknown> {
  /** Queue name this worker processes */
  readonly name: string;
  
  /** Whether the worker is running */
  readonly isRunning: boolean;
  
  /** Start processing jobs */
  run(): Promise<void>;
  
  /** Pause processing */
  pause(): Promise<void>;
  
  /** Resume processing */
  resume(): Promise<void>;
  
  /** Close the worker */
  close(): Promise<void>;
}

/**
 * Queue adapter interface - implemented by specific queue backends
 */
export interface IQueueAdapter<T = unknown> extends IQueue<T> {
  /** Get the underlying queue implementation for advanced use cases */
  getUnderlyingQueue(): unknown;
}

/**
 * Worker adapter interface - implemented by specific queue backends
 */
export interface IWorkerAdapter<T = unknown> extends IWorker<T> {
  /** Get the underlying worker implementation for advanced use cases */
  getUnderlyingWorker(): unknown;
}

/**
 * Connection options for queue backend
 */
export interface QueueConnectionOptions {
  /** Redis connection URL */
  redisUrl?: string;
  
  /** Redis host */
  host?: string;
  
  /** Redis port */
  port?: number;
  
  /** Redis password */
  password?: string;
  
  /** Redis database number */
  db?: number;
  
  /** Connection prefix for queue keys */
  prefix?: string;
  
  /** Enable TLS */
  tls?: boolean;
}
