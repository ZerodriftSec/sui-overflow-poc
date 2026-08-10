import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BUILTIN_CHAT_SKILLS, type ChatSkillDefinition } from "../lib/chat-skills";
import {
  deleteSkillFromWalrus,
  loadAllUserSkillsFromWalrus,
  saveSkillToWalrus,
} from "../lib/skills-storage";
import {
  getCachedUserSkills,
  hasCompletedSkillsWalrusMigration,
  markSkillsWalrusMigrationComplete,
  readLocalUserSkillsForMigration,
  setCachedUserSkills,
} from "../lib/skills-cache";
import {
  createUserSkill,
  type UserSkillRecord,
  userSkillToChatSkill,
} from "../lib/user-skills";
import { useWalrusStorage } from "../hooks/useWalrusStorage";

interface SkillsContextValue {
  loading: boolean;
  saving: boolean;
  error: string | null;
  userSkills: UserSkillRecord[];
  allSkills: ChatSkillDefinition[];
  refresh: () => Promise<void>;
  saveSkill: (skill: UserSkillRecord) => Promise<UserSkillRecord>;
  createSkill: (
    input: Omit<UserSkillRecord, "id" | "createdAt" | "updatedAt">,
  ) => Promise<UserSkillRecord>;
  deleteSkill: (skillId: string) => Promise<void>;
}

const SkillsContext = createContext<SkillsContextValue | null>(null);

export function SkillsProvider({ children }: { children: ReactNode }) {
  const { getStorageContext, vault } = useWalrusStorage();
  const vaultId = vault?.vaultId ?? null;
  const ownerAddress = vault?.ownerAddress ?? null;
  const migrationInFlightRef = useRef(false);
  const [userSkills, setUserSkills] = useState<UserSkillRecord[]>(() =>
    getCachedUserSkills(),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!vaultId || !ownerAddress) {
      const local = getCachedUserSkills();
      setUserSkills(local);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ctx = await getStorageContext();
      let remote = await loadAllUserSkillsFromWalrus(ctx);

      const local = readLocalUserSkillsForMigration();
      const shouldMigrateLegacySkills =
        remote.length === 0 &&
        local.length > 0 &&
        !hasCompletedSkillsWalrusMigration(ownerAddress) &&
        !migrationInFlightRef.current;

      if (shouldMigrateLegacySkills) {
        migrationInFlightRef.current = true;
        try {
          remote = await Promise.all(
            local.map((skill) => saveSkillToWalrus(ctx, skill)),
          );
          markSkillsWalrusMigrationComplete(ownerAddress);
        } finally {
          migrationInFlightRef.current = false;
        }
      }

      setCachedUserSkills(remote);
      setUserSkills(remote);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load skills from Walrus.";
      setError(message);
      const fallback = getCachedUserSkills();
      setUserSkills(fallback);
    } finally {
      setLoading(false);
    }
  }, [getStorageContext, ownerAddress, vaultId]);

  useEffect(() => {
    void refresh();
  }, [refresh, vaultId]);

  const saveSkill = useCallback(
    async (skill: UserSkillRecord): Promise<UserSkillRecord> => {
      setSaving(true);
      setError(null);

      try {
        const ctx = await getStorageContext();
        const saved = await saveSkillToWalrus(ctx, skill);
        const next = userSkills.some((item) => item.id === saved.id)
          ? userSkills.map((item) => (item.id === saved.id ? saved : item))
          : [...userSkills, saved];
        setCachedUserSkills(next);
        setUserSkills(next);
        return saved;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to save skill to Walrus.";
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [getStorageContext, userSkills],
  );

  const createSkill = useCallback(
    async (
      input: Omit<UserSkillRecord, "id" | "createdAt" | "updatedAt">,
    ): Promise<UserSkillRecord> => {
      const draft = createUserSkill(input);
      return saveSkill(draft);
    },
    [saveSkill],
  );

  const deleteSkill = useCallback(
    async (skillId: string): Promise<void> => {
      setSaving(true);
      setError(null);

      try {
        const ctx = await getStorageContext();
        await deleteSkillFromWalrus(ctx, skillId);
        const next = userSkills.filter((item) => item.id !== skillId);
        setCachedUserSkills(next);
        setUserSkills(next);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete skill from Walrus.";
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [getStorageContext, userSkills],
  );

  const allSkills = useMemo(
    (): ChatSkillDefinition[] => [
      ...BUILTIN_CHAT_SKILLS,
      ...userSkills.map(userSkillToChatSkill),
    ],
    [userSkills],
  );

  const value = useMemo(
    (): SkillsContextValue => ({
      loading,
      saving,
      error,
      userSkills,
      allSkills,
      refresh,
      saveSkill,
      createSkill,
      deleteSkill,
    }),
    [
      allSkills,
      createSkill,
      deleteSkill,
      error,
      loading,
      refresh,
      saveSkill,
      saving,
      userSkills,
    ],
  );

  return (
    <SkillsContext.Provider value={value}>{children}</SkillsContext.Provider>
  );
}

export function useSkills(): SkillsContextValue {
  const value = useContext(SkillsContext);
  if (!value) {
    throw new Error("useSkills must be used within SkillsProvider");
  }
  return value;
}
