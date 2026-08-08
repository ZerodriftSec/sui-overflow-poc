-- Sui settlement addresses are 0x + 64 hex (66 chars); app_chains was VARCHAR(64) from Solana widen.

ALTER TABLE "app_chains" ALTER COLUMN "settlementAddress" TYPE VARCHAR(66);
