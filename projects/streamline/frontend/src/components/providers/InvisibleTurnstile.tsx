"use client";

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** Client hint so SPA navigations skip without another network round-trip. */
const SESSION_FLAG = "sl_turnstile_ok";

/**
 * Invisible Turnstile on every route — but only challenges once per browser
 * session. After a successful verify, subsequent mounts (including deep links
 * to /app) see the session cookie / flag and no-op.
 *
 * Uses script `load` (not turnstile.ready()) — ready() forbids async scripts.
 */
export function InvisibleTurnstile() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!SITE_KEY || ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | undefined;

    const alreadyPassedClient =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(SESSION_FLAG) === "1";

    const verify = async (token: string) => {
      try {
        const res = await fetch("/api/turnstile/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          credentials: "same-origin",
        });
        if (res.ok) {
          try {
            sessionStorage.setItem(SESSION_FLAG, "1");
          } catch {
            /* private mode, etc. */
          }
        }
      } catch {
        // Silent — bots still fail server-side; humans keep using the app.
      }
    };

    const mount = () => {
      if (cancelled || !window.turnstile || !containerRef.current) return;
      if (widgetIdRef.current) return;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        size: "invisible",
        appearance: "interaction-only",
        execution: "execute",
        retry: "auto",
        callback: (token) => {
          void verify(token);
        },
        "error-callback": () => {
          // Auto-retry is handled by Turnstile when retry: "auto".
        },
        "expired-callback": () => {
          if (widgetIdRef.current && window.turnstile) {
            window.turnstile.execute(widgetIdRef.current);
          }
        },
      });

      window.turnstile.execute(widgetIdRef.current);
    };

    let cleanupScript: (() => void) | undefined;

    const loadScriptAndChallenge = () => {
      if (window.turnstile) {
        mount();
        return;
      }

      let script = document.querySelector<HTMLScriptElement>(
        `script[src="${SCRIPT_SRC}"]`
      );
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        document.head.appendChild(script);
      }

      const onLoad = () => mount();
      script.addEventListener("load", onLoad);
      cleanupScript = () => {
        script?.removeEventListener("load", onLoad);
      };

      if (window.turnstile) {
        mount();
      } else {
        pollId = setInterval(() => {
          if (window.turnstile) {
            clearInterval(pollId);
            mount();
          }
        }, 50);
      }
    };

    const start = async () => {
      if (alreadyPassedClient) return;

      try {
        const res = await fetch("/api/turnstile/verify", {
          credentials: "same-origin",
        });
        const data = (await res.json()) as { ok?: boolean };
        if (cancelled) return;
        if (data.ok) {
          try {
            sessionStorage.setItem(SESSION_FLAG, "1");
          } catch {
            /* ignore */
          }
          return;
        }
      } catch {
        // No cookie yet or network blip — still attempt challenge.
      }

      if (cancelled) return;
      loadScriptAndChallenge();
    };

    void start();

    return () => {
      cancelled = true;
      cleanupScript?.();
      if (pollId) clearInterval(pollId);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, []);

  if (!SITE_KEY) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        width: 0,
        height: 0,
        overflow: "hidden",
        pointerEvents: "none",
        opacity: 0,
      }}
    />
  );
}
