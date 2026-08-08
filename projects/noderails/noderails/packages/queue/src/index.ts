/**
 * Queue Abstraction Layer for NodeRails
 * 
 * This module provides a pluggable queue interface that can be backed by
 * different queue implementations (BullMQ, SQS, RabbitMQ, etc.)
 * 
 * To switch queue implementations:
 * 1. Create a new adapter implementing IQueueAdapter
 * 2. Update the createQueue/createWorker functions to use the new adapter
 * 3. No changes needed in services consuming the queue
 */

// Core interfaces
export * from './interfaces.js';

// Factory functions
export * from './factory.js';

// Job definitions
export * from './jobs/index.js';

// Re-export adapter for direct access if needed
export { BullMQAdapter, BullMQWorkerAdapter } from './adapters/bullmq.js';
