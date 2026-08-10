import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Film,
  Image,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Type,
} from "lucide-react";
import type { ChatSkillDefinition } from "../../lib/chat-skills";
import type { SkillMediaCategory } from "../../lib/skills-storage";
import {
  SKILL_MEDIA_CATEGORIES,
  skillMatchesCategory,
} from "../../lib/skills-storage";
import { cn } from "../../lib/utils";

const CATEGORY_ICONS: Record<
  SkillMediaCategory,
  typeof Type
> = {
  text: Type,
  image: Image,
  video: Film,
};

export type SkillsSelection =
  | { type: "skill"; skillId: string }
  | { type: "create"; category: SkillMediaCategory }
  | null;

interface SkillsSidebarProps {
  allSkills: ChatSkillDefinition[];
  selection: SkillsSelection;
  loading: boolean;
  onSelect: (selection: SkillsSelection) => void;
  onRefresh: () => void;
}

export function SkillsSidebar({
  allSkills,
  selection,
  loading,
  onSelect,
  onRefresh,
}: SkillsSidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<
    Set<SkillMediaCategory>
  >(() => new Set(["text", "image", "video"]));

  const skillsByCategory = useMemo(() => {
    const map = new Map<SkillMediaCategory, ChatSkillDefinition[]>();
    for (const category of SKILL_MEDIA_CATEGORIES) {
      map.set(
        category.id,
        allSkills.filter((skill) => skillMatchesCategory(skill, category.id)),
      );
    }
    return map;
  }, [allSkills]);

  function toggleCategory(category: SkillMediaCategory) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  function isSelected(skillId: string): boolean {
    return selection?.type === "skill" && selection.skillId === skillId;
  }

  return (
    <aside className="flex w-[260px] min-w-[260px] flex-none flex-col border-r border-border-subtle bg-bg-panel">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-subtle px-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Skills
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh skills"
          className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {SKILL_MEDIA_CATEGORIES.map((category) => {
          const skills = skillsByCategory.get(category.id) ?? [];
          const expanded = expandedCategories.has(category.id);
          const Icon = CATEGORY_ICONS[category.id];
          const creatingInCategory =
            selection?.type === "create" && selection.category === category.id;

          return (
            <div key={category.id}>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-medium text-text-secondary hover:bg-bg-raised hover:text-foreground"
                >
                  {expanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{category.label}</span>
                  <span className="ml-auto text-[10px] text-text-disabled">
                    {skills.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelect({ type: "create", category: category.id })}
                  aria-label={`Create ${category.label.toLowerCase()} skill`}
                  className={cn(
                    "mr-1 rounded p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground",
                    creatingInCategory && "bg-bg-raised text-foreground",
                  )}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              {expanded ? (
                <ul className="pb-1">
                  {skills.length === 0 ? (
                    <li className="px-6 py-2 text-[10px] text-text-disabled">
                      No skills yet
                    </li>
                  ) : (
                    skills.map((skill) => (
                      <li key={skill.id}>
                        <button
                          type="button"
                          onClick={() =>
                            onSelect({ type: "skill", skillId: skill.id })
                          }
                          className={cn(
                            "flex w-full items-start gap-2 px-4 py-1.5 text-left transition-colors hover:bg-bg-raised",
                            isSelected(skill.id) &&
                              "bg-bg-raised text-resolve-accent",
                          )}
                        >
                          {skill.builtin ? (
                            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-text-disabled" />
                          ) : (
                            <span className="mt-0.5 h-3 w-3 shrink-0" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-[11px]">
                              {skill.slashCommand}
                            </span>
                            <span className="block truncate text-[10px] text-text-secondary">
                              {skill.label}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
