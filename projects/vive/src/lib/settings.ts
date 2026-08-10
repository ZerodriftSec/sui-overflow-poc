const STORAGE_KEY = "content-studio-settings";
const LEGACY_STORAGE_KEY = "content-studio-settings";

export type CredentialSource = "env" | "settings";

export interface AppSettings {
  openRouterApiKey: string;
}

type StoredSettingsPayload = Partial<AppSettings>;

function readEnvValue(...keys: string[]): string {
  for (const key of keys) {
    const value = import.meta.env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function envDefaults(): AppSettings {
  return {
    openRouterApiKey: readEnvValue(
      "VITE_OPENROUTER_API_KEY",
      "OPENROUTER_API_KEY",
    ),
  };
}

function migrateLegacyLocalStorageSettings(): StoredSettingsPayload {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as StoredSettingsPayload;
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return parsed;
  } catch {
    return {};
  }
}

export function readRawStoredSettings(): StoredSettingsPayload {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as StoredSettingsPayload;
    }

    const migrated = migrateLegacyLocalStorageSettings();
    if (Object.keys(migrated).length > 0) {
      writeRawStoredSettings(migrated);
    }
    return migrated;
  } catch {
    return {};
  }
}

export function writeRawStoredSettings(payload: StoredSettingsPayload): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearRawStoredSettings(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function getCredentialSource(): CredentialSource {
  if (!import.meta.env.DEV) {
    return "settings";
  }

  const configured = readEnvValue(
    "VITE_CREDENTIAL_SOURCE",
    "CREDENTIAL_SOURCE",
  ).toLowerCase();

  return configured === "env" ? "env" : "settings";
}

export function usesEnvCredentials(): boolean {
  return getCredentialSource() === "env";
}

export function resolveActiveSettings(
  stored: StoredSettingsPayload,
): AppSettings {
  const env = envDefaults();

  if (usesEnvCredentials()) {
    return {
      openRouterApiKey:
        env.openRouterApiKey || stored.openRouterApiKey?.trim() || "",
    };
  }

  return {
    openRouterApiKey: stored.openRouterApiKey?.trim() ?? "",
  };
}

export function loadSettingsFromStorage(): AppSettings {
  return resolveActiveSettings(readRawStoredSettings());
}

export function mergeStoredSettings(
  partial: Partial<AppSettings>,
): AppSettings {
  const stored = readRawStoredSettings();
  const nextStored: StoredSettingsPayload = { ...stored, ...partial };
  writeRawStoredSettings(nextStored);
  return resolveActiveSettings(nextStored);
}

export function clearStoredSettingsFromStorage(): AppSettings {
  clearRawStoredSettings();
  return loadSettingsFromStorage();
}

export function isConfigured(settings: AppSettings): boolean {
  return settings.openRouterApiKey.trim().length > 0;
}

export function isStorageConfigured(
  settings: AppSettings,
  walletAddress?: string | null,
): boolean {
  return isConfigured(settings) && Boolean(walletAddress?.trim());
}
