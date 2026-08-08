import { z } from "zod";
import type { BehaviorMode, MediaMode } from "./chat-scope";
import type { ChatSkillDefinition } from "./chat-skills";
import {
  getCachedAllChatSkills,
  getCachedUserSkills,
  setCachedUserSkills,
  userSkillToChatSkillFromCache,
} from "./skills-cache";

const userSkillSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  slashCommand: z
    .string()
    .min(2)
    .refine((value) => value.startsWith("/"), "Slash command must start with /"),
  mediaModes: z.array(z.enum(["text", "image", "video"])),
  behaviorModes: z.array(z.enum(["ask", "draft", "edit", "agent"])),
  systemPromptTemplate: z.string().min(1),
  outputActionHints: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UserSkillRecord = z.infer<typeof userSkillSchema>;

export function parseUserSkill(raw: unknown): UserSkillRecord | null {
  try {
    return userSkillSchema.parse(raw);
  } catch {
    return null;
  }
}

export function userSkillToChatSkill(record: UserSkillRecord): ChatSkillDefinition {
  return userSkillToChatSkillFromCache(record);
}

export function loadUserSkills(): UserSkillRecord[] {
  return getCachedUserSkills();
}

export function saveUserSkills(skills: UserSkillRecord[]): void {
  setCachedUserSkills(skills);
}

export function createUserSkill(input: {
  label: string;
  description: string;
  slashCommand: string;
  mediaModes: MediaMode[];
  behaviorModes: BehaviorMode[];
  systemPromptTemplate: string;
  outputActionHints?: string[];
}): UserSkillRecord {
  const now = new Date().toISOString();
  const id = `user-${crypto.randomUUID()}`;
  return {
    id,
    label: input.label.trim(),
    description: input.description.trim(),
    slashCommand: input.slashCommand.trim().startsWith("/")
      ? input.slashCommand.trim()
      : `/${input.slashCommand.trim()}`,
    mediaModes: input.mediaModes,
    behaviorModes: input.behaviorModes,
    systemPromptTemplate: input.systemPromptTemplate.trim(),
    outputActionHints: input.outputActionHints ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertUserSkill(skill: UserSkillRecord): UserSkillRecord[] {
  const existing = loadUserSkills();
  const index = existing.findIndex((item) => item.id === skill.id);
  const next =
    index >= 0
      ? existing.map((item, itemIndex) => (itemIndex === index ? skill : item))
      : [...existing, skill];
  setCachedUserSkills(next);
  return next;
}

export function deleteUserSkill(skillId: string): UserSkillRecord[] {
  const next = loadUserSkills().filter((item) => item.id !== skillId);
  setCachedUserSkills(next);
  return next;
}

export function loadAllChatSkills(): ChatSkillDefinition[] {
  return getCachedAllChatSkills();
}
