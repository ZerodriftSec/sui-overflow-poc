import type { Server } from 'node:http';
import { SERVER_CONFIG } from '@noderails/common';
import type { Logger } from './logger.js';

export function gracefulShutdown(
  server: Server,
  logger: Logger,
  cleanupFns: Array<() => Promise<void>> = [],
): void {
  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown`);

    const timer = setTimeout(() => {
      logger.error('Shutdown timed out, forcing exit');
      process.exit(1);
    }, SERVER_CONFIG.SHUTDOWN_TIMEOUT_MS);

    try {
      server.close();

      for (const fn of cleanupFns) {
        await fn();
      }

      logger.info('Graceful shutdown complete');
      clearTimeout(timer);
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', { error: String(err) });
      clearTimeout(timer);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
