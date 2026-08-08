import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { SecretField } from "../settings/SecretField";
import {
  OPENROUTER_KEYS_URL,
  validateOpenRouterApiKey,
} from "../../lib/setup";
import { useSettings } from "../SettingsProvider";

interface OpenRouterSetupModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  onDismiss: () => void;
}

export function OpenRouterSetupModal({
  open,
  onClose,
  onComplete,
  onDismiss,
}: OpenRouterSetupModalProps) {
  const { saveSettings } = useSettings();
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setOpenRouterApiKey("");
    setSaving(false);
    setError("");
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  useEffect(() => {
    if (!open) return;

    function handleWindowFocus() {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }

    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, [open]);

  async function handleSaveAndContinue() {
    const trimmedKey = openRouterApiKey.trim();
    if (!trimmedKey) {
      setError("Paste your OpenRouter API key to continue.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await validateOpenRouterApiKey(trimmedKey);
      saveSettings({ openRouterApiKey: trimmedKey });
      onComplete();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not verify your OpenRouter API key.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleGetApiKey() {
    window.open(OPENROUTER_KEYS_URL, "_blank", "noopener,noreferrer");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="openrouter-setup-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-start justify-between border-b border-border px-5 py-4">
            <div>
              <h2 id="openrouter-setup-title" className="font-semibold">
                Connect OpenRouter
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Vive routes AI calls through OpenRouter. Bring your own key to start creating.
              </p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close setup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 px-5 py-5">
            <ol className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-foreground">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-950/50 text-[11px] text-green-400">
                  ✓
                </span>
                Wallet connected
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[11px]">
                  2
                </span>
                Add your OpenRouter API key
              </li>
            </ol>

            <button
              type="button"
              onClick={handleGetApiKey}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-opacity hover:opacity-90"
            >
              Get API key
              <ExternalLink className="h-3.5 w-3.5" />
            </button>

            <SecretField
              ref={inputRef}
              label="OpenRouter API key"
              id="openrouter-setup-api-key"
              value={openRouterApiKey}
              placeholder="sk-or-..."
              hint="Create a free account, copy the key, and paste it here."
              onChange={(value) => {
                setOpenRouterApiKey(value);
                if (error) setError("");
              }}
            />

            {error ? (
              <p className="text-sm text-destructive-foreground">{error}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onDismiss}
              className="shrink-0 px-1 py-2 text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Set up later
            </button>

            <button
              type="button"
              onClick={() => void handleSaveAndContinue()}
              disabled={saving || !openRouterApiKey.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Verifying…" : "Save & continue"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
