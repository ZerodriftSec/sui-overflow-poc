import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";

interface LiveModeContextType {
  isLive: boolean;
  setIsLive: (live: boolean) => void;
}

const LiveModeContext = createContext<LiveModeContextType | undefined>(undefined);

export function LiveModeProvider({ children }: { children: ReactNode }) {
  const [isLive, setIsLive] = useState(false);
  const account = useCurrentAccount();

  // Revert to mock mode if the wallet disconnects while in live mode
  useEffect(() => {
    if (isLive && !account) {
      setIsLive(false);
    }
  }, [account, isLive]);

  return (
    <LiveModeContext.Provider value={{ isLive, setIsLive }}>
      {children}
    </LiveModeContext.Provider>
  );
}

export function useLiveMode() {
  const context = useContext(LiveModeContext);
  if (context === undefined) {
    throw new Error("useLiveMode must be used within a LiveModeProvider");
  }
  return context;
}
