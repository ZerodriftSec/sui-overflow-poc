import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useEffect, useRef } from "react";
import { useLaunchStudio } from "./useLaunchStudio";

export function useWalletAuthRedirect(redirectTo = "/app") {
  const account = useCurrentAccount();
  const launch = useLaunchStudio(redirectTo);
  const authAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    if (!account?.address) {
      authAttemptRef.current = null;
      return;
    }

    if (launch.isAuthenticated) {
      void launch.launchStudio();
      return;
    }

    if (authAttemptRef.current === account.address) {
      return;
    }

    authAttemptRef.current = account.address;

    void launch.launchStudio().then((success) => {
      if (!success) {
        authAttemptRef.current = null;
      }
    });
  }, [account?.address, launch.isAuthenticated, launch.launchStudio]);

  return launch;
}
