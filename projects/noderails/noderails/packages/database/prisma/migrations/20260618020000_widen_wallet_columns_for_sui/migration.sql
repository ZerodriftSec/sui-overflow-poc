-- Widen wallet/address columns for Sui (0x + 64 hex = 66 chars). Solana base58 fits in 66.

ALTER TABLE "payout_intents" ALTER COLUMN "merchantWallet" TYPE VARCHAR(66);
ALTER TABLE "payout_intents" ALTER COLUMN "recipientWallet" TYPE VARCHAR(66);
ALTER TABLE "payout_intents" ALTER COLUMN "tokenAddress" TYPE VARCHAR(128);

ALTER TABLE "wallet_change_logs" ALTER COLUMN "previousAddress" TYPE VARCHAR(66);
ALTER TABLE "wallet_change_logs" ALTER COLUMN "newAddress" TYPE VARCHAR(66);

ALTER TABLE "customer_wallets" ALTER COLUMN "walletAddress" TYPE VARCHAR(66);
