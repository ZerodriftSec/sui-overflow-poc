import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { ChatSkillDefinition } from "../../lib/chat-skills";
import type { BehaviorMode, MediaMode } from "../../lib/chat-scope";
import type { SkillMediaCategory } from "../../lib/skills-storage";
import type { UserSkillRecord } from "../../lib/user-skills";
import { cn } from "../../lib/utils";
import type { SkillsSelection } from "./SkillsSidebar";

interface SkillDetailPanelProps {
  selection: SkillsSelection;
  skill: ChatSkillDefinition | null;
  userSkill: UserSkillRecord | null;
  saving: boolean;
  onSave: (input: Omit<UserSkillRecord, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onUpdate: (skill: UserSkillRecord) => Promise<void>;
  onDelete: (skillId: string) => Promise<void>;
}

const BEHAVIOR_MODES: BehaviorMode[] = ["ask", "draft", "edit", "agent"];

function defaultBehaviorModes(category: SkillMediaCategory): BehaviorMode[] {
  if (category === "text") return ["draft", "edit", "agent"];
  if (category === "video") return ["draft", "edit", "ask"];
  return ["draft", "edit"];
}

function emptyDraft(category: SkillMediaCategory): Omit<
  UserSkillRecord,
  "id" | "createdAt" | "updatedAt"
> {
  return {
    label: "",
    description: "",
    slashCommand: "/",
    mediaModes: [category],
    behaviorModes: defaultBehaviorModes(category),
    systemPromptTemplate: "",
    outputActionHints: [],
  };
}

function userSkillToDraft(skill: UserSkillRecord): Omit<
  UserSkillRecord,
  "id" | "createdAt" | "updatedAt"
> {
  return {
    label: skill.label,
    description: skill.description,
    slashCommand: skill.slashCommand,
    mediaModes: skill.mediaModes,
    behaviorModes: skill.behaviorModes,
    systemPromptTemplate: skill.systemPromptTemplate,
    outputActionHints: skill.outputActionHints,
  };
}

export function SkillDetailPanel({
  selection,
  skill,
  userSkill,
  saving,
  onSave,
  onUpdate,
  onDelete,
}: SkillDetailPanelProps) {
  const [draft, setDraft] = useState<
    Omit<UserSkillRecord, "id" | "createdAt" | "updatedAt"> | null
  >(null);
  const [error, setError] = useState("");

  const isCreating = selection?.type === "create";
  const isBuiltin = skill?.builtin ?? false;
  const isEditable = isCreating || (skill !== null && !isBuiltin);

  useEffect(() => {
    setError("");
    if (selection?.type === "create") {
      setDraft(emptyDraft(selection.category));
      return;
    }
    if (userSkill) {
      setDraft(userSkillToDraft(userSkill));
      return;
    }
    setDraft(null);
  }, [selection, skill, userSkill]);

  if (!selection) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center bg-bg-viewer px-6 text-center">
        <p className="text-[13px] text-text-secondary">
          Select a skill to view its prompt, or create a new one.
        </p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;

    if (!draft.label.trim()) {
      setError("Label is required.");
      return;
    }
    if (!draft.slashCommand.trim().startsWith("/")) {
      setError("Slash command must start with /.");
      return;
    }
    if (!draft.systemPromptTemplate.trim()) {
      setError("System prompt is required.");
      return;
    }

    try {
      if (isCreating) {
        await onSave(draft);
      } else if (userSkill) {
        await onUpdate({
          ...userSkill,
          ...draft,
        });
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to save skill.",
      );
    }
  }

  async function handleDelete() {
    if (!skill || skill.builtin) return;
    if (!window.confirm("Delete this skill?")) return;
    try {
      await onDelete(skill.id);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete skill.",
      );
    }
  }

  function toggleBehaviorMode(mode: BehaviorMode) {
    if (!draft || !isEditable) return;
    setDraft({
      ...draft,
      behaviorModes: draft.behaviorModes.includes(mode)
        ? draft.behaviorModes.filter((item) => item !== mode)
        : [...draft.behaviorModes, mode],
    });
  }

  function toggleMediaMode(mode: MediaMode) {
    if (!draft || !isEditable || isCreating) return;
    setDraft({
      ...draft,
      mediaModes: draft.mediaModes.includes(mode)
        ? draft.mediaModes.filter((item) => item !== mode)
        : [...draft.mediaModes, mode],
    });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-viewer">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-panel px-3">
        <span className="truncate text-[13px] font-semibold text-foreground">
          {isCreating
            ? "New skill"
            : skill?.label ?? "Skill"}
        </span>
        {skill && !skill.builtin ? (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={saving}
            className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-destructive-foreground disabled:opacity-50"
            aria-label="Delete skill"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isBuiltin && skill ? (
          <BuiltinSkillView skill={skill} />
        ) : draft ? (
          <form onSubmit={(event) => void handleSubmit(event)} className="mx-auto max-w-2xl space-y-4">
            <Field label="Label">
              <input
                type="text"
                value={draft.label}
                onChange={(event) =>
                  setDraft({ ...draft, label: event.target.value })
                }
                placeholder="Write Script"
                className="w-full rounded-sm border border-border-subtle bg-bg-panel px-3 py-2 text-[13px] outline-none focus:border-border-focus"
              />
            </Field>

            <Field label="Slash command">
              <input
                type="text"
                value={draft.slashCommand}
                onChange={(event) =>
                  setDraft({ ...draft, slashCommand: event.target.value })
                }
                placeholder="/my-skill"
                className="w-full rounded-sm border border-border-subtle bg-bg-panel px-3 py-2 font-mono text-[13px] outline-none focus:border-border-focus"
              />
            </Field>

            <Field label="Description">
              <textarea
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                rows={2}
                placeholder="What this skill helps the agent do"
                className="w-full resize-y rounded-sm border border-border-subtle bg-bg-panel px-3 py-2 text-[13px] outline-none focus:border-border-focus"
              />
            </Field>

            <Field label="System prompt">
              <textarea
                value={draft.systemPromptTemplate}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    systemPromptTemplate: event.target.value,
                  })
                }
                rows={12}
                placeholder="Instructions injected when this skill is active"
                className="w-full resize-y rounded-sm border border-border-subtle bg-bg-panel px-3 py-2 font-mono text-[12px] leading-relaxed outline-none focus:border-border-focus"
              />
            </Field>

            {!isCreating ? (
              <Field label="Media modes">
                <div className="flex flex-wrap gap-2">
                  {(["text", "image", "video"] as MediaMode[]).map((mode) => (
                    <ToggleChip
                      key={mode}
                      active={draft.mediaModes.includes(mode)}
                      onClick={() => toggleMediaMode(mode)}
                      label={mode}
                    />
                  ))}
                </div>
              </Field>
            ) : null}

            <Field label="Behavior modes">
              <div className="flex flex-wrap gap-2">
                {BEHAVIOR_MODES.map((mode) => (
                  <ToggleChip
                    key={mode}
                    active={draft.behaviorModes.includes(mode)}
                    onClick={() => toggleBehaviorMode(mode)}
                    label={mode}
                  />
                ))}
              </div>
            </Field>

            {error ? (
              <p className="text-[12px] text-destructive-foreground">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-sm bg-resolve-accent px-3 py-2 text-[13px] font-medium text-bg-app hover:opacity-90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {isCreating ? "Create skill" : "Save changes"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function BuiltinSkillView({ skill }: { skill: ChatSkillDefinition }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <MetaRow label="Command" value={skill.slashCommand} mono />
      <MetaRow label="Description" value={skill.description} />
      <MetaRow
        label="Media modes"
        value={skill.mediaModes.join(", ")}
      />
      <MetaRow
        label="Behavior modes"
        value={skill.behaviorModes.join(", ")}
      />
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          System prompt
        </p>
        <pre className="whitespace-pre-wrap rounded-sm border border-border-subtle bg-bg-panel p-3 font-mono text-[12px] leading-relaxed text-foreground">
          {skill.systemPromptTemplate}
        </pre>
      </div>
      {skill.outputActionHints.length > 0 ? (
        <MetaRow
          label="Output actions"
          value={skill.outputActionHints.join(", ")}
        />
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className={cn("text-[13px] text-foreground", mono && "font-mono")}>
        {value}
      </p>
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm border px-2 py-1 text-[11px] capitalize transition-colors",
        active
          ? "border-border-focus bg-bg-raised text-foreground"
          : "border-border-subtle text-text-secondary hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
