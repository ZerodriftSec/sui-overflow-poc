import { z } from "zod";
import type { MediaMode } from "./chat-scope";
import {
  parseUserSkill,
  type UserSkillRecord,
  userSkillToChatSkill,
} from "./user-skills";
import type { ChatSkillDefinition } from "./chat-skills";
import { skillRecordPath, skillsIndexPath } from "./storage/paths";
import {
  readTextAtPath,
  writeTextAtPath,
  type WalrusStorageContext,
} from "./storage/walrus-storage";

const skillsIndexEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  slashCommand: z.string().min(1),
  mediaModes: z.array(z.enum(["text", "image", "video"])),
  updatedAt: z.string(),
});

const skillsIndexDocumentSchema = z.object({
  type: z.literal("skills-index"),
  version: z.literal(1),
  skills: z.array(skillsIndexEntrySchema),
  updatedAt: z.string(),
});

export type SkillsIndexEntry = z.infer<typeof skillsIndexEntrySchema>;

export interface SkillsIndexDocument {
  type: "skills-index";
  version: 1;
  skills: SkillsIndexEntry[];
  updatedAt: string;
}

export type SkillMediaCategory = MediaMode;

export const SKILL_MEDIA_CATEGORIES: {
  id: SkillMediaCategory;
  label: string;
}[] = [
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
];

export function createEmptySkillsIndex(): SkillsIndexDocument {
  return {
    type: "skills-index",
    version: 1,
    skills: [],
    updatedAt: new Date().toISOString(),
  };
}

export function serializeSkillsIndex(doc: SkillsIndexDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function parseSkillsIndex(text: string): SkillsIndexDocument | null {
  try {
    return skillsIndexDocumentSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

function toIndexEntry(skill: UserSkillRecord): SkillsIndexEntry {
  return {
    id: skill.id,
    label: skill.label,
    slashCommand: skill.slashCommand,
    mediaModes: skill.mediaModes,
    updatedAt: skill.updatedAt,
  };
}

export function skillMatchesCategory(
  skill: Pick<ChatSkillDefinition, "mediaModes">,
  category: SkillMediaCategory,
): boolean {
  return skill.mediaModes.includes(category);
}

export async function loadSkillsIndex(
  ctx: WalrusStorageContext,
): Promise<SkillsIndexDocument> {
  const text = await readTextAtPath(ctx, skillsIndexPath());
  return parseSkillsIndex(text ?? "") ?? createEmptySkillsIndex();
}

async function persistSkillsIndex(
  ctx: WalrusStorageContext,
  doc: SkillsIndexDocument,
): Promise<void> {
  const payload: SkillsIndexDocument = {
    ...doc,
    updatedAt: new Date().toISOString(),
  };
  await writeTextAtPath(ctx, skillsIndexPath(), serializeSkillsIndex(payload));
}

export async function loadSkillRecord(
  ctx: WalrusStorageContext,
  skillId: string,
): Promise<UserSkillRecord | null> {
  const text = await readTextAtPath(ctx, skillRecordPath(skillId));
  if (!text) return null;
  return parseUserSkill(JSON.parse(text));
}

export async function loadAllUserSkillsFromWalrus(
  ctx: WalrusStorageContext,
): Promise<UserSkillRecord[]> {
  const index = await loadSkillsIndex(ctx);
  const records = await Promise.all(
    index.skills.map((entry) => loadSkillRecord(ctx, entry.id)),
  );
  return records.filter((record): record is UserSkillRecord => record !== null);
}

export async function saveSkillToWalrus(
  ctx: WalrusStorageContext,
  skill: UserSkillRecord,
): Promise<UserSkillRecord> {
  const updated: UserSkillRecord = {
    ...skill,
    updatedAt: new Date().toISOString(),
  };

  await writeTextAtPath(
    ctx,
    skillRecordPath(updated.id),
    JSON.stringify(updated, null, 2),
  );

  const index = await loadSkillsIndex(ctx);
  const entry = toIndexEntry(updated);
  const existingIndex = index.skills.findIndex((item) => item.id === updated.id);
  const skills =
    existingIndex >= 0
      ? index.skills.map((item, itemIndex) =>
          itemIndex === existingIndex ? entry : item,
        )
      : [...index.skills, entry];

  skills.sort((a, b) => a.label.localeCompare(b.label));

  await persistSkillsIndex(ctx, {
    ...index,
    skills,
  });

  return updated;
}

export async function deleteSkillFromWalrus(
  ctx: WalrusStorageContext,
  skillId: string,
): Promise<void> {
  const index = await loadSkillsIndex(ctx);
  await persistSkillsIndex(ctx, {
    ...index,
    skills: index.skills.filter((item) => item.id !== skillId),
  });
}

export function userSkillsToChatSkills(
  records: UserSkillRecord[],
): ChatSkillDefinition[] {
  return records.map(userSkillToChatSkill);
}
