import { useEffect, useRef, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { X } from "lucide-react";
import { SecretField } from "./settings/SecretField";
import { useSettings } from "./SettingsProvider";
import { isStorageConfigured, usesEnvCredentials } from "../lib/settings";
import { clearSetupDismissals, validateOpenRouterApiKey } from "../lib/setup";

type HealthStatus = "idle" | "checking" | "ok" | "error";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export function SettingsModal({ open, onClose, onSave }: SettingsModalProps) {
  const account = useCurrentAccount();
  const { settings, saveSettings, clearStoredCredentials } = useSettings();
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("idle");
  const [healthMessage, setHealthMessage] = useState("");
  const firstInputRef = useRef<HTMLInputElement>(null);

  const secretsFromEnv = usesEnvCredentials();

  useEffect(() => {
    if (open) {
      setOpenRouterApiKey(settings.openRouterApiKey);
      setSaved(false);
      setHealthStatus("idle");
      setHealthMessage("");
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [open, settings.openRouterApiKey]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleSave() {
    saveSettings({ openRouterApiKey });
    setSaved(true);
    onSave?.();
  }

  function handleClearSavedCredentials() {
    if (secretsFromEnv) return;

    clearStoredCredentials();
    clearSetupDismissals();
    setOpenRouterApiKey("");
    setSaved(false);
    setHealthStatus("idle");
    setHealthMessage("");
    onSave?.();
  }

  async function handleHealthCheck() {
    if (!isStorageConfigured(settings, account?.address)) {
      setHealthStatus("error");
      setHealthMessage(
        account?.address
          ? "Save your OpenRouter API key first."
          : "Connect your wallet and save your OpenRouter API key.",
      );
      return;
    }

    setHealthStatus("checking");
    setHealthMessage("");

    try {
      await validateOpenRouterApiKey(settings.openRouterApiKey);

      setHealthStatus("ok");
      setHealthMessage(
        `OpenRouter connected; wallet ${account!.address.slice(0, 6)}…${account!.address.slice(-4)} ready for Walrus storage.`,
      );
    } catch (err) {
      setHealthStatus("error");
      setHealthMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="settings-title" className="font-semibold">
              Settings
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close settings"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 px-5 py-5">

            <SecretField
              ref={firstInputRef}
              label="OpenRouter API Key"
              id="openRouterApiKey"
              value={openRouterApiKey}
              placeholder="sk-or-..."
              readOnly={secretsFromEnv}
              hint={
                secretsFromEnv ? (
                  <>API key is loaded from environment variables and cannot be edited here.</>
                ) : (
                  <>
                    All LLM calls route through{" "}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      openrouter.ai
                    </a>
                    .
                  </>
                )
              }
              onChange={setOpenRouterApiKey}
            />
          </div>

          {healthStatus !== "idle" && (
            <div
              className={`mx-5 mb-4 rounded-md px-3 py-2 text-sm ${
                healthStatus === "checking"
                  ? "border border-border bg-muted/30 text-muted-foreground"
                  : healthStatus === "ok"
                    ? "border border-green-800 bg-green-950/40 text-green-400"
                    : "border border-destructive/30 bg-destructive/10 text-destructive-foreground"
              }`}
            >
              {healthStatus === "checking"
                ? "Checking connection…"
                : `${healthStatus === "ok" ? "✓ " : "✗ "}${healthMessage}`}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={handleClearSavedCredentials}
              disabled={secretsFromEnv}
              className="shrink-0 px-1 py-2 text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
            >
              Clear saved credentials
            </button>

            <div className="flex shrink-0 items-center justify-end gap-2">
              {saved ? (
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  Saved.
                </span>
              ) : null}
              <button
                type="button"
                onClick={handleHealthCheck}
                disabled={healthStatus === "checking"}
                className="whitespace-nowrap rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {healthStatus === "checking" ? "Checking…" : "Test connection"}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={secretsFromEnv}
                className="whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
