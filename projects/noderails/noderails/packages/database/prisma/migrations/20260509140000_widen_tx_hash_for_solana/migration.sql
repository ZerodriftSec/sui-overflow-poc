-- Solana signatures are base58 (~88 chars); widen hash columns on payment intents.

ALTER TABLE "payment_intents" ALTER COLUMN "authorizationTxHash" SET DATA TYPE VARCHAR(128);
ALTER TABLE "payment_intents" ALTER COLUMN "captureTxHash" SET DATA TYPE VARCHAR(128);
ALTER TABLE "payment_intents" ALTER COLUMN "refundTxHash" SET DATA TYPE VARCHAR(128);
