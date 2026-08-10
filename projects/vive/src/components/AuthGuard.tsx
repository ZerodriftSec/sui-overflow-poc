import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const account = useCurrentAccount();
  const location = useLocation();

  if (!account) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return children;
}
