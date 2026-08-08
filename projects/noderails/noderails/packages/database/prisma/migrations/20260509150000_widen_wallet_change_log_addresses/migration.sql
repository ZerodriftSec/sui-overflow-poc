-- Solana base58 pubkeys exceed 42 chars; align with Prisma WalletChangeLog model.

ALTER TABLE "wallet_change_logs" ALTER COLUMN "previousAddress" TYPE VARCHAR(64);
ALTER TABLE "wallet_change_logs" ALTER COLUMN "newAddress" TYPE VARCHAR(64);
