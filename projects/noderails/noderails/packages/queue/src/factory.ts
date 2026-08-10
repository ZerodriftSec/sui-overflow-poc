/**
 * Queue Factory
 * 
 * Factory functions for creating queues and workers.
 * Change the adapter imports here to switch queue implementations.
 */

import { BullMQAdapter, BullMQWorkerAdapter } from './adapters/bullmq.js';
import type {
  IQueue,
  IWorker,
  JobProcessor,
  WorkerOptions,
  WorkerEvents,
  QueueConnectionOptions,
} from './interfaces.js';

// ============ Configuration ============

/**
 * Global queue connection options
 * Set once at application startup
 */
let globalConnectionOptions: QueueConnectionOptions = {};

/**
 * Configure global queue connection options
 */
export function configureQueue(options: QueueConnectionOptions): void {
  globalConnectionOptions = options;
}

/**
 * Get current queue connection options
 */
export function getQueueConfig(): QueueConnectionOptions {
  return globalConnectionOptions;
}

// ============ Factory Functions ============

/**
 * Create a new queue
 * 
 * @example
 * ```ts
 * import { createQueue } from '@noderails/queue';
 * 
 * interface PaymentJob {
 *   paymentIntentId: string;
 *   action: 'capture' | 'settle';
 * }
 * 
 * const paymentQueue = createQueue<PaymentJob>('payments');
 * 
 * await paymentQueue.add('capture', {
 *   paymentIntentId: '123',
 *   action: 'capture'
 * });
 * ```
 */
export function createQueue<T = unknown>(
  name: string,
  options?: QueueConnectionOptions
): IQueue<T> {
  const mergedOptions = { ...globalConnectionOptions, ...options };
  return new BullMQAdapter<T>(name, mergedOptions);
}

/**
 * Create a new worker to process queue jobs
 * 
 * @example
 * ```ts
 * import { createWorker } from '@noderails/queue';
 * 
 * const worker = createWorker<PaymentJob>(
 *   'payments',
 *   async (job) => {
 *     console.log(`Processing ${job.data.action} for ${job.data.paymentIntentId}`);
 *     // Process the job...
 *     return { success: true };
 *   },
 *   { concurrency: 5 },
 *   {
 *     onCompleted: (job, result) => console.log(`Job ${job.id} completed`),
 *     onFailed: (job, error) => console.error(`Job ${job.id} failed:`, error),
 *   }
 * );
 * 
 * await worker.run();
 * ```
 */
export function createWorker<T = unknown>(
  name: string,
  processor: JobProcessor<T>,
  options?: WorkerOptions & QueueConnectionOptions,
  events?: WorkerEvents<T>
): IWorker<T> {
  const mergedOptions = { ...globalConnectionOptions, ...options };
  return new BullMQWorkerAdapter<T>(name, processor, mergedOptions, events);
}

// ============ Queue Registry ============

/**
 * Registry for managing multiple queues
 */
class QueueRegistry {
  private queues = new Map<string, IQueue<unknown>>();
  private workers = new Map<string, IWorker<unknown>>();

  /**
   * Get or create a queue
   */
  getOrCreateQueue<T>(name: string, options?: QueueConnectionOptions): IQueue<T> {
    if (!this.queues.has(name)) {
      this.queues.set(name, createQueue<T>(name, options));
    }
    return this.queues.get(name) as IQueue<T>;
  }

  /**
   * Register a worker
   */
  registerWorker<T>(
    name: string,
    processor: JobProcessor<T>,
    options?: WorkerOptions & QueueConnectionOptions,
    events?: WorkerEvents<T>
  ): IWorker<T> {
    if (this.workers.has(name)) {
      throw new Error(`Worker for queue "${name}" already registered`);
    }
    const worker = createWorker<T>(name, processor, options, events);
    this.workers.set(name, worker);
    return worker;
  }

  /**
   * Get a registered worker
   */
  getWorker<T>(name: string): IWorker<T> | undefined {
    return this.workers.get(name) as IWorker<T> | undefined;
  }

  /**
   * Start all workers
   */
  async startAll(): Promise<void> {
    await Promise.all(
      Array.from(this.workers.values()).map((w) => w.run())
    );
  }

  /**
   * Stop all workers
   */
  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(this.workers.values()).map((w) => w.close())
    );
    this.workers.clear();
  }

  /**
   * Close all queues
   */
  async closeAll(): Promise<void> {
    await this.stopAll();
    await Promise.all(
      Array.from(this.queues.values()).map((q) => q.close())
    );
    this.queues.clear();
  }
}

/**
 * Global queue registry instance
 */
export const queueRegistry = new QueueRegistry();
