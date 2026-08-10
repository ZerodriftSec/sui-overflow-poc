import { useMemo, useState } from "react";
import { AppTopBar } from "../components/AppTopBar";
import { useSetup } from "../components/SetupProvider";
import { useSkills } from "../components/SkillsProvider";
import { SkillDetailPanel } from "../components/skills/SkillDetailPanel";
import {
  SkillsSidebar,
  type SkillsSelection,
} from "../components/skills/SkillsSidebar";
import type { UserSkillRecord } from "../lib/user-skills";

export function SkillsPage() {
  const { openSettings, needsApiKey } = useSetup();
  const {
    allSkills,
    userSkills,
    loading,
    saving,
    error,
    refresh,
    createSkill,
    saveSkill,
    deleteSkill,
  } = useSkills();
  const [selection, setSelection] = useState<SkillsSelection>(null);

  const selectedSkill = useMemo(
    () =>
      selection?.type === "skill"
        ? allSkills.find((skill) => skill.id === selection.skillId) ?? null
        : null,
    [allSkills, selection],
  );

  const selectedUserSkill = useMemo(
    () =>
      selection?.type === "skill"
        ? userSkills.find((skill) => skill.id === selection.skillId) ?? null
        : null,
    [selection, userSkills],
  );

  async function handleSave(
    input: Omit<UserSkillRecord, "id" | "createdAt" | "updatedAt">,
  ) {
    const created = await createSkill(input);
    setSelection({ type: "skill", skillId: created.id });
  }

  async function handleUpdate(skill: UserSkillRecord) {
    await saveSkill(skill);
  }

  async function handleDelete(skillId: string) {
    await deleteSkill(skillId);
    setSelection(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-app text-foreground">
      <AppTopBar
        centerTitle="Skills"
        onOpenSettings={openSettings}
        showSetupIndicator={needsApiKey}
      />

      {error ? (
        <div className="border-b border-border-subtle bg-bg-panel px-3 py-2 text-[12px] text-destructive-foreground">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <SkillsSidebar
          allSkills={allSkills}
          selection={selection}
          loading={loading}
          onSelect={setSelection}
          onRefresh={() => void refresh()}
        />
        <SkillDetailPanel
          selection={selection}
          skill={selectedSkill}
          userSkill={selectedUserSkill}
          saving={saving}
          onSave={handleSave}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
