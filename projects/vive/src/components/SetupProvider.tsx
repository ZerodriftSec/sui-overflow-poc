import { useCurrentAccount } from "@mysten/dapp-kit-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SettingsModal } from "./SettingsModal";
import { OpenRouterSetupModal } from "./setup/OpenRouterSetupModal";
import { SetupBanner } from "./setup/SetupBanner";
import {
  clearSetupDismissals,
  dismissSetupBanner,
  dismissSetupModal,
  getSetupState,
  isSetupBannerDismissed,
  isSetupModalDismissed,
} from "../lib/setup";
import { showToast } from "../lib/toast";
import { useSettings } from "./SettingsProvider";
import { usesEnvCredentials } from "../lib/settings";

interface SetupContextValue {
  isReady: boolean;
  needsApiKey: boolean;
  showBanner: boolean;
  openSetup: () => void;
  openSettings: () => void;
  requestCredentials: () => void;
  dismissBanner: () => void;
  refreshSetup: () => void;
}

const SetupContext = createContext<SetupContextValue | null>(null);

export function useSetup(): SetupContextValue {
  const context = useContext(SetupContext);
  if (!context) {
    throw new Error("useSetup must be used within SetupProvider");
  }
  return context;
}

interface SetupProviderProps {
  children: ReactNode;
}

export function SetupProvider({ children }: SetupProviderProps) {
  const account = useCurrentAccount();
  const { settings } = useSettings();
  const [setupOpen, setSetupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(isSetupBannerDismissed);

  const setupState = useMemo(
    () => getSetupState(account?.address, settings),
    [account?.address, settings],
  );

  const skipSetupFlow = usesEnvCredentials() && setupState.hasApiKey;
  const showBanner =
    setupState.needsApiKey && !bannerDismissed && !skipSetupFlow;

  const refreshSetup = useCallback(() => {}, []);

  const openSetup = useCallback(() => {
    setSetupOpen(true);
  }, []);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const requestCredentials = useCallback(() => {
    if (setupState.needsApiKey && !skipSetupFlow) {
      openSetup();
      return;
    }
    openSettings();
  }, [openSetup, openSettings, setupState.needsApiKey, skipSetupFlow]);

  const dismissBanner = useCallback(() => {
    dismissSetupBanner();
    setBannerDismissed(true);
  }, []);

  const handleSetupDismiss = useCallback(() => {
    dismissSetupModal();
    setSetupOpen(false);
  }, []);

  const handleSetupComplete = useCallback(() => {
    clearSetupDismissals();
    setBannerDismissed(false);
    refreshSetup();
    showToast("success", "OpenRouter connected. You're ready to create.");
  }, [refreshSetup]);

  useEffect(() => {
    if (skipSetupFlow || setupState.isReady || isSetupModalDismissed()) {
      return;
    }
    if (setupState.needsApiKey) {
      setSetupOpen(true);
    }
  }, [setupState.isReady, setupState.needsApiKey, skipSetupFlow]);

  const value = useMemo<SetupContextValue>(
    () => ({
      isReady: setupState.isReady,
      needsApiKey: setupState.needsApiKey && !skipSetupFlow,
      showBanner,
      openSetup,
      openSettings,
      requestCredentials,
      dismissBanner,
      refreshSetup,
    }),
    [
      dismissBanner,
      openSetup,
      openSettings,
      refreshSetup,
      requestCredentials,
      setupState.isReady,
      setupState.needsApiKey,
      showBanner,
      skipSetupFlow,
    ],
  );

  return (
    <SetupContext.Provider value={value}>
      <div className="flex h-screen flex-col overflow-hidden">
        {showBanner ? (
          <SetupBanner onSetup={openSetup} onDismiss={dismissBanner} />
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
      <OpenRouterSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onComplete={handleSetupComplete}
        onDismiss={handleSetupDismiss}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={refreshSetup}
      />
    </SetupContext.Provider>
  );
}
