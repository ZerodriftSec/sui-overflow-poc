-- Solana base58 payout wallets exceed 42 chars.

ALTER TABLE "payout_intents" ALTER COLUMN "merchantWallet" TYPE VARCHAR(64);
