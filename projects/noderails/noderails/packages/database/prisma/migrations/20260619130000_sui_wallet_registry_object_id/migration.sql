-- Sui WalletRegistry shared object id on SupportedChain (NodeRailsWallet flows)

ALTER TABLE "supported_chains"
  ADD COLUMN IF NOT EXISTS "walletRegistryObjectId" VARCHAR(66);
