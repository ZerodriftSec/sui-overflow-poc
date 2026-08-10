-- Solana support: chain type, wider addresses, optional MTXM chain id
CREATE TYPE "ChainType" AS ENUM ('EVM', 'SOLANA');

ALTER TABLE "supported_chains" ADD COLUMN "chainType" "ChainType" NOT NULL DEFAULT 'EVM';
ALTER TABLE "supported_chains" ADD COLUMN "mtxmChainDbId" VARCHAR(64);

ALTER TABLE "supported_chains" ALTER COLUMN "escrowAddress" TYPE VARCHAR(64);
ALTER TABLE "supported_chains" ALTER COLUMN "merchantManagerAddress" TYPE VARCHAR(64);

ALTER TABLE "supported_tokens" ALTER COLUMN "contractAddress" TYPE VARCHAR(64);

ALTER TABLE "app_chains" ALTER COLUMN "settlementAddress" TYPE VARCHAR(64);
