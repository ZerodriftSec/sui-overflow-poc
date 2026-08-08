import {
  DEVNET_VAULT_PACKAGE_ID,
  MAINNET_VAULT_PACKAGE_ID,
  TESTNET_VAULT_PACKAGE_ID,
} from "../constants";

export function vaultPackageOptions(
  network: "testnet" | "mainnet" | "devnet" = "testnet",
): { package: string } {
  return { package: getVaultPackageId(network) };
}

export function getVaultPackageId(network: "testnet" | "mainnet" | "devnet" = "testnet"): string {
  switch (network) {
    case "mainnet":
      if (!MAINNET_VAULT_PACKAGE_ID) {
        throw new Error("MAINNET_VAULT_PACKAGE_ID is not configured.");
      }
      return MAINNET_VAULT_PACKAGE_ID;
    case "devnet":
      if (!DEVNET_VAULT_PACKAGE_ID) {
        throw new Error("DEVNET_VAULT_PACKAGE_ID is not configured.");
      }
      return DEVNET_VAULT_PACKAGE_ID;
    case "testnet":
    default:
      if (!TESTNET_VAULT_PACKAGE_ID) {
        throw new Error("TESTNET_VAULT_PACKAGE_ID is not configured.");
      }
      return TESTNET_VAULT_PACKAGE_ID;
  }
}
