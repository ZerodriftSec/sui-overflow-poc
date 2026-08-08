import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";
import type { ChatSkillDefinition } from "../../../lib/chat-skills";

interface SlashSkillMenuProps {
  skills: ChatSkillDefinition[];
  activeIndex: number;
  onSelect: (skill: ChatSkillDefinition) => void;
  className?: string;
}

export function SlashSkillMenu({
  skills,
  activeIndex,
  onSelect,
  className,
}: SlashSkillMenuProps) {
  if (skills.length === 0) {
    return null;
  }

  const builtinSkills = skills.filter((skill) => skill.builtin);
  const userSkills = skills.filter((skill) => !skill.builtin);

  let runningIndex = 0;

  function renderSection(
    title: string,
    sectionSkills: ChatSkillDefinition[],
  ): ReactNode {
    if (sectionSkills.length === 0) return null;

    const section = (
      <div key={title}>
        <div className="bg-bg-raised/50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-text-secondary">
          {title}
        </div>
        {sectionSkills.map((skill) => {
          const itemIndex = runningIndex;
          runningIndex += 1;
          return (
            <button
              key={skill.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(skill);
              }}
              className={cn(
                "flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-bg-raised",
                itemIndex === activeIndex
                  ? "bg-bg-raised text-resolve-accent"
                  : "text-foreground",
              )}
            >
              <span className="text-[11px] font-medium">{skill.slashCommand}</span>
              <span className="truncate text-[10px] text-text-secondary">
                {skill.description}
              </span>
            </button>
          );
        })}
      </div>
    );

    return section;
  }

  return (
    <div
      className={cn(
        "absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[240px] overflow-y-auto rounded-lg border border-border-subtle bg-bg-panel shadow-xl",
        className,
      )}
      role="listbox"
      aria-label="Skills"
    >
      {renderSection("Skills", builtinSkills)}
      {renderSection("Your Skills", userSkills)}
    </div>
  );
}
