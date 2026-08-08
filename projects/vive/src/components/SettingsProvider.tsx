import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearStoredSettingsFromStorage,
  loadSettingsFromStorage,
  mergeStoredSettings,
  type AppSettings,
} from "../lib/settings";

interface SettingsContextValue {
  settings: AppSettings;
  saveSettings: (partial: Partial<AppSettings>) => AppSettings;
  clearStoredCredentials: () => AppSettings;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return context;
}

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadSettingsFromStorage(),
  );

  const saveSettings = useCallback((partial: Partial<AppSettings>) => {
    const next = mergeStoredSettings(partial);
    setSettings(next);
    return next;
  }, []);

  const clearStoredCredentials = useCallback(() => {
    const next = clearStoredSettingsFromStorage();
    setSettings(next);
    return next;
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      saveSettings,
      clearStoredCredentials,
    }),
    [clearStoredCredentials, saveSettings, settings],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}
