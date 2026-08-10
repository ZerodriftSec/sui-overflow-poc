/**
 * Prisma configuration file
 * @see https://www.prisma.io/docs/orm/reference/prisma-config-reference
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'prisma/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load root .env first (monorepo single-env pattern), fall back to local .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // local .env as fallback (won't override already-set vars)

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Use process.env directly to avoid error when DATABASE_URL is not set
    // (e.g., during `prisma generate` in CI without DB access)
    url: process.env.DATABASE_URL ?? '',
  },
});
