-- Sui chain type + object id columns (additive; existing EVM/Solana rows unchanged)

ALTER TYPE "ChainType" ADD VALUE IF NOT EXISTS 'SUI';

ALTER TABLE "supported_chains"
  ALTER COLUMN "escrowAddress" TYPE VARCHAR(66),
  ALTER COLUMN "merchantManagerAddress" TYPE VARCHAR(66);

ALTER TABLE "supported_chains"
  ADD COLUMN IF NOT EXISTS "escrowConfigObjectId" VARCHAR(66),
  ADD COLUMN IF NOT EXISTS "paymentRegistryObjectId" VARCHAR(66),
  ADD COLUMN IF NOT EXISTS "merchantManagerConfigObjectId" VARCHAR(66);
