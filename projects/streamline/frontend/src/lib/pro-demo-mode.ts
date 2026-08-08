"use client";

import { useEffect, useState } from "react";

const KEY = "sl-pro-demo";
const EVENT = "sl-pro-demo";

/** Session-only Pro explore mode (no wallet). Cleared on real connect. */
export function isProDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function enterProDemoMode() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function exitProDemoMode() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useProDemoMode(): boolean {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    const sync = () => setDemo(isProDemoMode());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  return demo;
}
