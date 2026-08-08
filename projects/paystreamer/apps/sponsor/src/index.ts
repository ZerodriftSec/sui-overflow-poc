import express from 'express';
import { PORT, NETWORK, SUI_RPC_URL, PACKAGE_ID, SPONSOR_ADDRESS } from './lib/config.js';
import { getSponsorAddress, client } from './lib/sui.js';
import sponsorRoutes from './sponsor/routes.js';

import cors from 'cors';

export const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// Sponsor routes
app.use('/api', sponsorRoutes);

// Health check endpoint at /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    network: NETWORK,
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[HTTP] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
});

/**
 * Verifies that all required services are properly configured
 */
async function verifyConfiguration(): Promise<boolean> {
  console.log('[Startup] Verifying configuration...');

  // Check sponsor address
  try {
    const sponsorAddress = getSponsorAddress();
    console.log(`[Startup] Sponsor address: ${sponsorAddress}`);
  } catch (error) {
    console.error('[Startup] ERROR: SPONSOR_ADDRESS is not set or invalid');
    return false;
  }

  // Check RPC connection
  try {
    const chainIdentifier = await client.getChainIdentifier();
    console.log(`[Startup] Connected to Sui network: ${chainIdentifier}`);
  } catch (error) {
    console.error('[Startup] ERROR: Failed to connect to Sui RPC:', SUI_RPC_URL);
    return false;
  }

  // Log configuration
  console.log('[Startup] Configuration:');
  console.log(`  Network: ${NETWORK}`);
  console.log(`  RPC URL: ${SUI_RPC_URL}`);
  console.log(`  Package ID: ${PACKAGE_ID}`);
  console.log(`  Port: ${PORT}`);

  return true;
}

/**
 * Starts the HTTP server
 */
async function startServer(): Promise<void> {
  const isValid = await verifyConfiguration();
  
  if (!isValid) {
    console.error('[Startup] Configuration validation failed, but continuing anyway for local dev...');
  }

  // Start HTTP server
  app.listen(PORT, () => {
    console.log(`[Startup] HTTP server listening on port ${PORT}`);
  });

  // Graceful shutdown handlers
  const shutdown = (signal: string) => {
    console.log(`[Shutdown] Received ${signal}, shutting down gracefully...`);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start the service if not running in test mode
if (process.env.NODE_ENV !== 'test') {
  console.log('[Startup] Sponsor Service starting...');
  startServer().catch((error) => {
    console.error('[Startup] Failed to start service:', error);
    process.exit(1);
  });
}
