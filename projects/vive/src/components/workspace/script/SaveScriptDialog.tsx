import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface SaveScriptDialogProps {
  open: boolean;
  initialTitle: string;
  heading?: string;
  submitLabel?: string;
  onClose: () => void;
  onSave: (title: string) => void;
}

export function SaveScriptDialog({
  open,
  initialTitle,
  heading = "Save script as",
  submitLabel = "Save",
  onClose,
  onSave,
}: SaveScriptDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [open, initialTitle]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Enter a script name.");
      return;
    }
    setError(null);
    onSave(trimmed);
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
        aria-labelledby="save-script-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="save-script-title" className="font-semibold">
              {heading}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            <div className="space-y-1.5">
              <label htmlFor="script-name" className="block text-sm font-medium">
                Script name
              </label>
              <input
                ref={inputRef}
                id="script-name"
                type="text"
                value={title}
                placeholder="My Script"
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {error && (
                <p className="text-xs text-destructive-foreground">{error}</p>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-border pt-4">
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {submitLabel}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
