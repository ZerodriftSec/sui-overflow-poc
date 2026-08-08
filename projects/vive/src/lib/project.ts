import { PHASES, type Phase } from "../components/workspace/types";
import {
  buildProjectManifest,
  parseProjectManifest,
  serializeProjectManifest,
} from "./project-manifest";
import {
  buildManifestPathForProject,
  buildProjectRegistryWrite,
  listProjectRegistryFromWalrus,
  type ProjectRegistryRecord,
} from "./project-registry";
import { manifestPath } from "./storage/paths";
import {
  ensurePathIndexInitialized,
  writeTextsAtLogicalPaths,
  type WalrusStorageContext,
} from "./storage/walrus-storage";

export type PhaseStatus = "locked" | "active" | "approved" | "stale";

export interface PhaseState {
  status: PhaseStatus;
  approvedVersion: number | null;
  currentVersion: number;
  approvedBlobId: string | null;
  currentBlobId: string | null;
}

export interface StoryboardSource {
  scriptId: string;
  scriptTitle: string;
  version: number;
  blobId: string;
  blobObjectId?: string;
}

export type StoryboardCardStatus = "draft" | "review" | "approved" | "locked";

export type StoryboardScenePrimitive =
  | "box"
  | "sphere"
  | "capsule"
  | "cylinder"
  | "cone"
  | "plane";

export interface StoryboardSceneVector3 {
  x: number;
  y: number;
  z: number;
}

export interface StoryboardSceneCamera {
  projection: "perspective";
  position: StoryboardSceneVector3;
  target: StoryboardSceneVector3;
  fov: number;
}

export interface StoryboardSceneLight {
  id: string;
  type: "ambient" | "directional";
  color: string;
  intensity: number;
  position?: StoryboardSceneVector3;
}

export interface StoryboardSceneObject {
  id: string;
  label: string;
  primitive: StoryboardScenePrimitive;
  color: string;
  position: StoryboardSceneVector3;
  rotation: StoryboardSceneVector3;
  scale: StoryboardSceneVector3;
}

export interface StoryboardSceneGround {
  enabled: boolean;
  color: string;
  size: number;
}

export interface StoryboardSceneGraph {
  version: 1;
  summary: string;
  camera: StoryboardSceneCamera;
  lights: StoryboardSceneLight[];
  objects: StoryboardSceneObject[];
  ground?: StoryboardSceneGround;
}

export interface StoryboardBlockingBox2D {
  id: string;
  label: string;
  color: string;
  shape:
    | "person"
    | "table"
    | "door"
    | "window"
    | "vehicle"
    | "prop"
    | "box";
  x: number;
  y: number;
  width: number;
  height: number;
  depth: "foreground" | "midground" | "background";
}

export interface StoryboardBlocking2D {
  version: 1;
  summary: string;
  backgroundColor: string;
  boxes: StoryboardBlockingBox2D[];
}

export interface StoryboardCard {
  id: string;
  sceneIndex: number;
  shotIndex: number;
  title: string;
  scriptSegment: string;
  storyPurpose: string;
  shotDescription: string;
  shotType: "ECU" | "CU" | "MCU" | "MS" | "WS" | "EWS";
  cameraAngle: "eye-level" | "high-angle" | "low-angle" | "birds-eye" | "dutch";
  cameraMovement: string;
  characterAction: string;
  visualSketch: string;
  sceneGraph?: StoryboardSceneGraph | null;
  blocking2d?: StoryboardBlocking2D | null;
  dialogue: string;
  voiceover: string;
  sfx: string;
  musicCue: string;
  continuity: string;
  estimatedDurationSec: number;
  transitionOut: "cut" | "dissolve" | "fade-to-black" | "wipe" | "match-cut";
  generationPrompt: string;
  negativePrompt: string;
  status: StoryboardCardStatus;
}

export interface StoryboardSheetImage {
  mimeType: string;
  dataBase64?: string;
  imageBlobId?: string;
  imageBlobObjectId?: string;
}

export interface StoryboardSheetEntry {
  segmentId: string;
  segmentIndex: number;
  segmentTitle: string;
  durationSec: number;
  shotIds: string[];
  panelCount: number;
  shotId: string;
  prompt: string;
  panelAspectRatio?: string;
  image: StoryboardSheetImage;
}

export interface StoryboardDocument {
  sourceScriptId?: string;
  sourceScriptVersion?: number;
  sourceScriptBlobId?: string;
  updatedAt: string;
  cards: StoryboardCard[];
  sheets?: StoryboardSheetEntry[];
}

export interface StoryboardAssetVersion {
  version: number;
  blobId: string;
  blobObjectId?: string;
  savedAt: string;
}

export interface StoryboardAsset {
  id: string;
  title: string;
  blobId?: string;
  blobObjectId?: string;
  updatedAt: string;
  currentVersion: number;
  versions: StoryboardAssetVersion[];
}

export interface Project {
  id: string;
  ownerAddress: string;
  vaultId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  phases: Record<Phase, PhaseState>;
  walrusPathPrefix: string;
  manifestPath: string;
  manifestBlobId: string;
  manifestBlobObjectId?: string;
  storyboardSource?: StoryboardSource | null;
  activeStoryboardId?: string | null;
}

export interface CreateProjectInput {
  title: string;
}

const PROJECTS_STORAGE_KEY = "content-studio-projects";
const LAST_PROJECT_STORAGE_KEY = "content-studio-last-project-id";

export function projectWalrusPath(projectId: string): string {
  return `project/${projectId}/`;
}

function createPhaseState(
  _phase: Phase,
  status: PhaseStatus,
): PhaseState {
  return {
    status,
    approvedVersion: null,
    currentVersion: 0,
    approvedBlobId: null,
    currentBlobId: null,
  };
}

function createInitialPhases(): Record<Phase, PhaseState> {
  return PHASES.reduce(
    (acc, { id }) => {
      acc[id] = createPhaseState(
        id,
        id === "script" ? "active" : "locked",
      );
      return acc;
    },
    {} as Record<Phase, PhaseState>,
  );
}

function mergePhaseState(
  baseState: PhaseState,
  storedState: Partial<PhaseState> | undefined,
): PhaseState {
  if (!storedState) return baseState;
  return {
    ...baseState,
    ...storedState,
  };
}

function normalizeProjectPhases(
  phases: Partial<Record<Phase | "blueprint", PhaseState>> | undefined,
): Record<Phase, PhaseState> {
  const base = createInitialPhases();
  const designState = phases?.design ?? phases?.blueprint;
  return {
    script: mergePhaseState(base.script, phases?.script),
    design: mergePhaseState(base.design, designState),
    storyboard: mergePhaseState(base.storyboard, phases?.storyboard),
    film: mergePhaseState(base.film, phases?.film),
  };
}

function normalizeLegacyProject(raw: Record<string, unknown>): Project | null {
  if (typeof raw.id !== "string" || typeof raw.title !== "string") {
    return null;
  }

  const ownerAddress =
    typeof raw.ownerAddress === "string"
      ? raw.ownerAddress
      : typeof raw.ownerMemwalAccountId === "string"
        ? raw.ownerMemwalAccountId
        : "";

  const walrusPathPrefix =
    typeof raw.walrusPathPrefix === "string"
      ? raw.walrusPathPrefix
      : projectWalrusPath(raw.id);

  const manifestPath =
    typeof raw.manifestPath === "string"
      ? raw.manifestPath
      : buildManifestPathForProject(raw.id);

  return {
    id: raw.id,
    ownerAddress,
    vaultId: typeof raw.vaultId === "string" ? raw.vaultId : "",
    title: raw.title,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    phases: normalizeProjectPhases(
      raw.phases as Partial<Record<Phase | "blueprint", PhaseState>> | undefined,
    ),
    walrusPathPrefix,
    manifestPath,
    manifestBlobId:
      typeof raw.manifestBlobId === "string"
        ? raw.manifestBlobId
        : typeof raw.workspaceBlobId === "string"
          ? raw.workspaceBlobId
          : "",
    manifestBlobObjectId:
      typeof raw.manifestBlobObjectId === "string" ? raw.manifestBlobObjectId : undefined,
    storyboardSource: (raw.storyboardSource as StoryboardSource | null | undefined) ?? null,
    activeStoryboardId: (raw.activeStoryboardId as string | null | undefined) ?? null,
  };
}

function readProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((project) => normalizeLegacyProject(project))
      .filter((project): project is Project => project !== null);
  } catch {
    return [];
  }
}

function writeProjects(projects: Project[]): void {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

export function listProjects(): Project[] {
  return readProjects().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getProject(projectId: string): Project | null {
  return readProjects().find((project) => project.id === projectId) ?? null;
}

export function getProjectByWalrusPrefix(
  walrusPathPrefix: string,
): Project | null {
  const normalized = walrusPathPrefix.trim();
  if (!normalized) return null;
  return (
    readProjects().find((project) => project.walrusPathPrefix === normalized) ??
    null
  );
}

export function saveProject(project: Project): void {
  const projects = readProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index === -1) {
    projects.push(project);
  } else {
    projects[index] = project;
  }
  writeProjects(projects);
}

function mergeRegistryEntryIntoProject(
  entry: ProjectRegistryRecord,
  existing?: Project,
): Project {
  if (existing) {
    return {
      ...existing,
      title: entry.title,
      ownerAddress: entry.ownerAddress,
      walrusPathPrefix: entry.walrusPathPrefix,
      manifestPath: entry.manifestPath,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  return {
    id: entry.projectId,
    title: entry.title,
    ownerAddress: entry.ownerAddress,
    vaultId: "",
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    walrusPathPrefix: entry.walrusPathPrefix,
    manifestPath: entry.manifestPath,
    manifestBlobId: "",
    phases: createInitialPhases(),
  };
}

export async function syncProjectsFromWalrus(
  ctx: WalrusStorageContext,
): Promise<Project[]> {
  const entries = await listProjectRegistryFromWalrus(ctx);
  const localProjects = readProjects();
  const localById = new Map(localProjects.map((project) => [project.id, project]));

  const mergedById = new Map<string, Project>();

  for (const entry of entries) {
    mergedById.set(
      entry.projectId,
      mergeRegistryEntryIntoProject(entry, localById.get(entry.projectId)),
    );
  }

  for (const localProject of localProjects) {
    if (!mergedById.has(localProject.id)) {
      mergedById.set(localProject.id, localProject);
    }
  }

  const merged = [...mergedById.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  writeProjects(merged);
  return merged;
}

export function getLastProjectId(): string | null {
  return localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
}

export function setLastProjectId(projectId: string): void {
  localStorage.setItem(LAST_PROJECT_STORAGE_KEY, projectId);
}

export function clearProjectsCache(): void {
  localStorage.removeItem(PROJECTS_STORAGE_KEY);
  localStorage.removeItem(LAST_PROJECT_STORAGE_KEY);
}

function buildLocalProject(input: CreateProjectInput, ownerAddress: string, vaultId: string): Project {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const walrusPathPrefix = projectWalrusPath(id);
  const manifestPathValue = buildManifestPathForProject(id);

  return {
    id,
    ownerAddress,
    vaultId,
    title: input.title.trim(),
    createdAt: now,
    updatedAt: now,
    walrusPathPrefix,
    manifestPath: manifestPathValue,
    manifestBlobId: "",
    phases: createInitialPhases(),
  };
}

export async function provisionProjectOnWalrus(
  ctx: WalrusStorageContext,
  project: Project,
): Promise<Project> {
  // The registry read only depends on ctx (not on the manifest), and the
  // path-index check is a cheap local-cache lookup — run them concurrently
  // instead of paying for the registry's network round trip after the fact.
  const [, registryWrite] = await Promise.all([
    ensurePathIndexInitialized(ctx),
    buildProjectRegistryWrite(ctx, project),
  ]);

  const manifest = buildProjectManifest({
    projectId: project.id,
    title: project.title,
    ownerAddress: project.ownerAddress,
    vaultId: project.vaultId,
    walrusPathPrefix: project.walrusPathPrefix,
    manifestPath: project.manifestPath,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  });

  // Write the manifest and the updated registry together in one on-chain
  // transaction instead of two sequential signAndExecute round trips.
  const [manifestRef] = await writeTextsAtLogicalPaths(ctx, [
    { logicalPath: project.manifestPath, text: serializeProjectManifest(manifest) },
    { logicalPath: registryWrite.logicalPath, text: registryWrite.text },
  ]);

  const provisioned: Project = {
    ...project,
    manifestBlobId: manifestRef.blobId,
    manifestBlobObjectId: manifestRef.blobObjectId,
    updatedAt: new Date().toISOString(),
  };

  saveProject(provisioned);
  return provisioned;
}

export async function loadProjectManifest(
  ctx: WalrusStorageContext,
  project: Project,
): Promise<ReturnType<typeof buildProjectManifest>> {
  const { readProjectTextAtPath } = await import("./storage/walrus-storage");
  const text = await readProjectTextAtPath(
    ctx,
    project.walrusPathPrefix,
    manifestPath(project.id),
  );

  if (!text) {
    throw new Error(`Project manifest not found at ${project.manifestPath}`);
  }

  const manifest = parseProjectManifest(text);
  if (!manifest || manifest.projectId !== project.id) {
    throw new Error(`Invalid manifest for project "${project.id}".`);
  }

  return manifest;
}

export async function createProject(
  ctx: WalrusStorageContext,
  input: CreateProjectInput,
): Promise<Project> {
  const project = buildLocalProject(
    input,
    ctx.vault.ownerAddress,
    ctx.vault.vaultId,
  );
  saveProject(project);
  setLastProjectId(project.id);

  try {
    return await provisionProjectOnWalrus(ctx, project);
  } catch (error) {
    const projects = readProjects().filter((item) => item.id !== project.id);
    writeProjects(projects);
    throw error;
  }
}

export function touchProject(projectId: string): void {
  const project = getProject(projectId);
  if (!project) return;
  saveProject({
    ...project,
    updatedAt: new Date().toISOString(),
  });
}

export interface ApproveScriptForDesignInput {
  scriptId: string;
  scriptTitle: string;
  version: number;
  blobId: string;
  blobObjectId?: string;
}

export function approveScriptForDesign(
  projectId: string,
  input: ApproveScriptForDesignInput,
): Project | null {
  const project = getProject(projectId);
  if (!project) return null;

  const now = new Date().toISOString();
  const updated: Project = {
    ...project,
    updatedAt: now,
    storyboardSource: {
      scriptId: input.scriptId,
      scriptTitle: input.scriptTitle,
      version: input.version,
      blobId: input.blobId,
      blobObjectId: input.blobObjectId,
    },
    phases: {
      ...project.phases,
      script: {
        ...project.phases.script,
        status: "approved",
        approvedVersion: input.version,
        approvedBlobId: input.blobId,
        currentVersion: input.version,
        currentBlobId: input.blobId,
      },
      design: {
        ...project.phases.design,
        status:
          project.phases.design.status === "locked"
            ? "active"
            : project.phases.design.status,
      },
    },
  };

  saveProject(updated);
  return updated;
}

export function getActiveStoryboardId(projectId: string): string | null {
  const project = getProject(projectId);
  if (!project) return null;
  return project.activeStoryboardId ?? null;
}

export function setActiveStoryboard(projectId: string, storyboardId: string): Project | null {
  const project = getProject(projectId);
  if (!project) return null;

  const updated: Project = {
    ...project,
    activeStoryboardId: storyboardId,
    updatedAt: new Date().toISOString(),
  };
  saveProject(updated);
  return updated;
}
