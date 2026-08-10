import { BUILTIN_CHAT_SKILLS, type ChatSkillDefinition } from "./chat-skills";
import type { BehaviorMode, MediaMode } from "./chat-scope";
import { parseUserSkill, type UserSkillRecord } from "./user-skills";

const USER_SKILLS_STORAGE_KEY = "user-chat-skills";

export function userSkillToChatSkillFromCache(
  record: UserSkillRecord,
): ChatSkillDefinition {
  return {
    id: record.id,
    label: record.label,
    description: record.description,
    slashCommand: record.slashCommand,
    mediaModes: record.mediaModes as MediaMode[],
    behaviorModes: record.behaviorModes as BehaviorMode[],
    systemPromptTemplate: record.systemPromptTemplate,
    outputActionHints: record.outputActionHints,
    builtin: false,
  };
}

function readLocalUserSkills(): UserSkillRecord[] {
  try {
    const raw = localStorage.getItem(USER_SKILLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => parseUserSkill(item))
      .filter((item): item is UserSkillRecord => item !== null);
  } catch {
    return [];
  }
}

function writeLocalUserSkills(skills: UserSkillRecord[]): void {
  localStorage.setItem(USER_SKILLS_STORAGE_KEY, JSON.stringify(skills));
}

let cachedUserSkills: UserSkillRecord[] = readLocalUserSkills();

export function getCachedUserSkills(): UserSkillRecord[] {
  return cachedUserSkills;
}

export function getCachedAllChatSkills(): ChatSkillDefinition[] {
  return [
    ...BUILTIN_CHAT_SKILLS,
    ...cachedUserSkills.map(userSkillToChatSkillFromCache),
  ];
}

export function setCachedUserSkills(skills: UserSkillRecord[]): void {
  cachedUserSkills = skills;
  writeLocalUserSkills(skills);
}

export function readLocalUserSkillsForMigration(): UserSkillRecord[] {
  return readLocalUserSkills();
}

function skillsWalrusMigrationKey(ownerAddress: string): string {
  return `skills-walrus-migrated:${ownerAddress}`;
}

export function hasCompletedSkillsWalrusMigration(
  ownerAddress: string,
): boolean {
  return localStorage.getItem(skillsWalrusMigrationKey(ownerAddress)) === "1";
}

export function markSkillsWalrusMigrationComplete(ownerAddress: string): void {
  localStorage.setItem(skillsWalrusMigrationKey(ownerAddress), "1");
}
