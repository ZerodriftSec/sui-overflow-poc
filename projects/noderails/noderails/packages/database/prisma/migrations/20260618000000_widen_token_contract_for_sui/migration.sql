-- Sui coin types (package::module::Type) can exceed 64 chars; widen token contractAddress storage.

ALTER TABLE "supported_tokens" ALTER COLUMN "contractAddress" TYPE VARCHAR(128);
