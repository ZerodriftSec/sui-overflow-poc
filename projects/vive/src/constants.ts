// TODO: Update these with your deployed package IDs after running `sui client publish`
export const DEVNET_COUNTER_PACKAGE_ID: string | undefined = undefined;
export const TESTNET_COUNTER_PACKAGE_ID: string | undefined = undefined;
export const MAINNET_COUNTER_PACKAGE_ID: string | undefined = undefined;

export const DEVNET_VAULT_PACKAGE_ID: string | undefined = undefined;
/** Published content_vault package (directory/file/access/seal_policy). Republish after contract changes. */
export const TESTNET_VAULT_PACKAGE_ID =
  "0x76f3e481bf63aa2ce148a46bc93038fa7153d83c1d87161876fcdeb70937916a";
export const MAINNET_VAULT_PACKAGE_ID: string | undefined = undefined;

/** Logical path for the workspace project registry document (on-chain indexed file). */
export const VAULT_REGISTRY_PATH = "registry.json";
/** @deprecated Path index is on-chain; kept for transitional imports. */
export const VAULT_PATH_INDEX_PATH = "path-index.json";
