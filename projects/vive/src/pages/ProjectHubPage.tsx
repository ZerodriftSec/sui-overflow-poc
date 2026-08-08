import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Clock, Film, Loader2, Plus } from "lucide-react";
import { AppTopBar } from "../components/AppTopBar";
import { useSetup } from "../components/SetupProvider";
import { useWalrusStorage } from "../hooks/useWalrusStorage";
import {
  createProject,
  listProjects,
  syncProjectsFromWalrus,
  type Project,
} from "../lib/project";
import { isStorageConfigured } from "../lib/settings";
import { showToast } from "../lib/toast";
import { isWorkspaceStorageNotFoundError } from "../lib/vault";
import { isWalrusBlobNotFoundError } from "../lib/walrus/provider-service";
import { useSettings } from "../components/SettingsProvider";

function toastMessageForLoadError(error: unknown): string {
  if (!(error instanceof Error) || !error.message.trim()) {
    return "Failed to load projects from Walrus";
  }
  // Keep toast readable; full provider dumps can be enormous.
  const maxLen = 320;
  return error.message.length > maxLen
    ? `${error.message.slice(0, maxLen)}…`
    : error.message;
}

export function ProjectHubPage() {
  const navigate = useNavigate();
  const account = useCurrentAccount();
  const walrusStorage = useWalrusStorage();
  const { openSetup, openSettings, needsApiKey, isReady } = useSetup();
  const { settings } = useSettings();
  const [projects, setProjects] = useState<Project[]>(() => listProjects());
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [title, setTitle] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      setLoadingProjects(true);

      if (!account?.address) {
        if (!cancelled) {
          setProjects(listProjects());
          setLoadingProjects(false);
        }
        return;
      }

      try {
        const ctx = await walrusStorage.getStorageContext();
        const synced = await syncProjectsFromWalrus(ctx);
        if (!cancelled) {
          setProjects(synced);
        }
      } catch (error) {
        if (!cancelled) {
          setProjects(listProjects());
          // Missing workspace / expired blobs are expected empty states.
          if (
            !isWorkspaceStorageNotFoundError(error) &&
            !isWalrusBlobNotFoundError(error)
          ) {
            console.error("Failed to sync projects from Walrus", error);
            showToast("error", toastMessageForLoadError(error));
          }
        }
      } finally {
        if (!cancelled) {
          setLoadingProjects(false);
        }
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [account?.address, walrusStorage.getStorageContext]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || submitting) return;

    if (!isStorageConfigured(settings, account?.address)) {
      openSetup();
      return;
    }

    setSubmitting(true);
    setCreateError("");

    try {
      // First project after a fresh publish creates the on-chain workspace.
      await walrusStorage.ensureVault();
      const ctx = await walrusStorage.getStorageContext();
      const project = await createProject(ctx, { title: title.trim() });
      setProjects(listProjects());
      setTitle("");
      setCreating(false);
      navigate(`/app/projects/${project.id}`);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Failed to create project on Walrus",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleNewProjectClick() {
    if (needsApiKey) {
      openSetup();
      return;
    }
    setCreating((value) => !value);
  }

  function openProject(projectId: string) {
    navigate(`/app/projects/${projectId}`);
  }

  const walletConnected = Boolean(account?.address);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-app text-foreground">
      <AppTopBar
        centerTitle="Projects"
        onOpenSettings={openSettings}
        showSetupIndicator={needsApiKey}
      />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <p className="max-w-lg text-[13px] text-text-secondary">
            Each project is stored as Seal-encrypted blobs in your Walrus vault.
          </p>
          <button
            type="button"
            onClick={handleNewProjectClick}
            disabled={!walletConnected}
            className="inline-flex items-center gap-2 rounded-sm bg-resolve-accent px-3 py-2 text-[13px] font-medium text-bg-app hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            New project
          </button>
        </div>

        {!walletConnected && (
          <p className="mb-4 text-[12px] text-text-secondary">
            Connect your wallet to sync projects from Walrus and create new ones.
          </p>
        )}

        {creating && (
          <form
            onSubmit={handleCreate}
            className="mb-8 rounded-sm border border-border-subtle bg-bg-panel p-4"
          >
            <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
              New project
            </h2>
            <label className="block space-y-1.5">
              <span className="text-[11px] text-text-secondary">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Product launch reel"
                required
                autoFocus
                disabled={submitting}
                className="w-full rounded-sm border border-border-subtle bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-border-focus disabled:opacity-60"
              />
            </label>

            {createError && (
              <p className="mt-3 text-[12px] text-destructive-foreground">
                {createError}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-sm bg-resolve-accent px-3 py-1.5 text-[13px] font-medium text-bg-app hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? "Creating project…" : "Create project"}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                disabled={submitting}
                className="rounded-sm px-3 py-1.5 text-[13px] text-text-secondary hover:text-foreground transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loadingProjects ? (
          <div className="flex items-center justify-center gap-2 rounded-sm border border-border-subtle bg-bg-panel px-6 py-16 text-[13px] text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border-subtle bg-bg-panel px-6 py-16 text-center">
            <Film className="mx-auto mb-3 h-8 w-8 text-text-disabled" />
            <p className="text-[13px] text-text-secondary">
              No projects yet. Create one to start scripting.
            </p>
            {walletConnected && needsApiKey ? (
              <button
                type="button"
                onClick={openSetup}
                className="mt-4 inline-flex items-center gap-2 rounded-sm border border-resolve-accent/50 bg-resolve-accent/10 px-3 py-2 text-[13px] font-medium text-resolve-accent transition-colors hover:border-resolve-accent hover:bg-resolve-accent/15"
              >
                Connect OpenRouter to get started
              </button>
            ) : null}
            {walletConnected && isReady ? (
              <button
                type="button"
                onClick={handleNewProjectClick}
                className="mt-4 inline-flex items-center gap-2 rounded-sm bg-resolve-accent px-3 py-2 text-[13px] font-medium text-bg-app hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                New project
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => openProject(project.id)}
                className="rounded-sm border border-border-subtle bg-bg-panel p-4 text-left transition-colors hover:border-border-focus hover:bg-bg-raised"
              >
                <h3 className="truncate text-[15px] font-semibold">{project.title}</h3>
                <p className="mt-1 truncate font-mono text-[11px] text-text-secondary">
                  {project.walrusPathPrefix}
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-text-disabled">
                  <Clock className="h-3 w-3" />
                  Updated {new Date(project.updatedAt).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
