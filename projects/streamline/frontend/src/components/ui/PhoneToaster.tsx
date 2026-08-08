"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import {
  dismissPhoneToast,
  getPhoneToasts,
  getPhoneToastsServer,
  subscribePhoneToasts,
  type PhoneToastItem,
} from "@/lib/phone-toast";

function ToastCard({ item }: { item: PhoneToastItem }) {
  const error = item.kind === "error";
  const success = item.kind === "success";
  return (
    <button
      type="button"
      onClick={() => dismissPhoneToast(item.id)}
      className={`sl-phone-toast pointer-events-auto w-full max-w-[280px] rounded-2xl border px-3.5 py-2.5 text-left text-[12px] font-medium leading-snug shadow-[0_10px_28px_rgba(0,0,0,0.16)] backdrop-blur-md ${
        error
          ? "border-[#c0533a]/35 bg-white/95 text-[#b33a28]"
          : success
            ? "border-emerald-600/30 bg-white/95 text-emerald-800"
            : "border-black/10 bg-white/95 text-[#111]"
      }`}
    >
      {item.message}
    </button>
  );
}

function ToastStack({ contained }: { contained: boolean }) {
  const items = useSyncExternalStore(
    subscribePhoneToasts,
    getPhoneToasts,
    getPhoneToastsServer
  );
  if (items.length === 0) return null;

  return (
    <div
      className={`pointer-events-none z-[120] flex flex-col items-center gap-2 ${
        contained
          ? "absolute inset-x-0 top-10 px-3"
          : "fixed inset-x-0 top-4 px-4"
      }`}
      data-sl-phone-toaster
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}

/**
 * Renders toasts inside `[data-sl-phone-stage]` when the phone mockup / embedded
 * shell is mounted; otherwise fixed at the top of the viewport.
 */
export function PhoneToaster() {
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const find = () =>
      document.querySelector("[data-sl-phone-stage]") as HTMLElement | null;

    setStage(find());
    const mo = new MutationObserver(() => setStage(find()));
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  if (!mounted) return null;

  if (stage) {
    return createPortal(<ToastStack contained />, stage);
  }
  return createPortal(<ToastStack contained={false} />, document.body);
}
