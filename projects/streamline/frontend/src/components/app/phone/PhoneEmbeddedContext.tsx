"use client";

import { createContext, useContext } from "react";

const PhoneEmbeddedContext = createContext(false);

export function PhoneEmbeddedProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PhoneEmbeddedContext.Provider value={true}>
      {children}
    </PhoneEmbeddedContext.Provider>
  );
}

export function usePhoneEmbedded() {
  return useContext(PhoneEmbeddedContext);
}
