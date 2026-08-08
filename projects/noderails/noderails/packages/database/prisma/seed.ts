import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load root .env first (monorepo single-env pattern), fall back to local .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Prisma 7: Pass connectionString directly, not pg.Pool
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting database seed...');

  // Add any seed data here for development
  // Example: Create a test merchant for development

  // Uncomment and modify as needed:
  // const testMerchant = await prisma.merchant.upsert({
  //   where: { email: 'test@noderails.dev' },
  //   update: {},
  //   create: {
  //     email: 'test@noderails.dev',
  //     emailVerified: true,
  //     apps: {
  //       create: {
  //         name: 'Test App',
  //         environment: 'TEST',
  //       },
  //     },
  //   },
  // });
  // console.log('Created test merchant:', testMerchant.id);

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
