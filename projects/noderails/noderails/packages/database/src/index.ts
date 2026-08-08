/**
 * @noderails/database - Database client and utilities
 * 
 * Uses Prisma 7 with PostgreSQL driver adapter for ESM-first,
 * serverless-compatible database access.
 */

import fs from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

// Re-export Prisma client and types
export { PrismaClient } from './generated/prisma/client.js';
export * from './generated/prisma/client.js';

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  /**
   * PostgreSQL connection string (required)
   */
  url: string;
  
  /**
   * Absolute path to SSL CA certificate (.pem) file.
   * If provided, enables SSL with this CA.
   */
  sslCaPath?: string;

  /**
   * Enable query logging for debugging
   */
  logQueries?: boolean;
  
  /**
   * PostgreSQL schema to use (default: public)
   */
  schema?: string;
}

/**
 * Internal state
 */
let globalPrisma: PrismaClient | undefined;

/**
 * Create or get the Prisma client instance
 * Uses singleton pattern with PostgreSQL driver adapter
 */
export function createDatabaseClient(config: DatabaseConfig): PrismaClient {
  if (globalPrisma) {
    return globalPrisma;
  }

  const connectionString = config.url;
  
  // Prisma 7 + node-pg: SSL cert validation is strict.
  // RDS/managed Postgres often need rejectUnauthorized: false.
  // Auto-enable SSL for RDS hosts; explicit CA cert takes priority.
  const isRds = /\.rds\.(amazonaws|amazon)\./i.test(connectionString);
  const ssl = config.sslCaPath
    ? { ca: fs.readFileSync(config.sslCaPath, 'utf-8') }
    : isRds
      ? { rejectUnauthorized: false }
      : undefined;
  
  // Create Prisma adapter with connection string (Prisma 7 API)
  const adapter = new PrismaPg(
    { connectionString, ...(ssl && { ssl }) },
    config.schema ? { schema: config.schema } : undefined
  );
  
  // Create Prisma client with adapter
  globalPrisma = new PrismaClient({
    adapter,
    log: config.logQueries 
      ? ['query', 'info', 'warn', 'error'] 
      : ['warn', 'error'],
  });

  return globalPrisma;
}

/**
 * Get the existing Prisma client (must be created first with createDatabaseClient)
 */
export function getDatabaseClient(): PrismaClient {
  if (!globalPrisma) {
    throw new Error('Database not initialized. Call createDatabaseClient(config) first.');
  }
  return globalPrisma;
}

/**
 * Disconnect the database client
 */
export async function disconnectDatabase(): Promise<void> {
  if (globalPrisma) {
    await globalPrisma.$disconnect();
    globalPrisma = undefined;
  }
}

/**
 * Health check for database connection
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const client = getDatabaseClient();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Transaction helper with automatic rollback on error
 */
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export async function withTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  const client = getDatabaseClient();
  return client.$transaction(fn);
}
