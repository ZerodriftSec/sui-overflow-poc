import fs from 'node:fs';
import { statePath } from '../state-dir';
import { PREDICT } from './config';
import type { PredictManagerRef } from './server';

interface ManagerRegistryFile {
  version: 1;
  managers: PredictManagerRef[];
}

function registryPath(): string {
  return statePath(`.predict-managers-${PREDICT.packageId.slice(2, 14)}.json`);
}

function readRegistry(): ManagerRegistryFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath(), 'utf8')) as ManagerRegistryFile;
    return parsed.version === 1 && Array.isArray(parsed.managers)
      ? parsed
      : { version: 1, managers: [] };
  } catch {
    return { version: 1, managers: [] };
  }
}

function writeRegistry(registry: ManagerRegistryFile): void {
  const file = registryPath();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function managedManagers(): PredictManagerRef[] {
  return readRegistry().managers.filter((manager) => manager.package === PREDICT.packageId);
}

export function registerManagedManager(args: {
  managerId: string;
  owner: string;
  digest?: string;
}): void {
  if (PREDICT.mode !== 'managed') return;
  const registry = readRegistry();
  const owner = args.owner.toLowerCase();
  const exists = registry.managers.some(
    (manager) =>
      manager.manager_id.toLowerCase() === args.managerId.toLowerCase() ||
      ((manager.owner ?? '').toLowerCase() === owner && manager.package === PREDICT.packageId),
  );
  if (exists) return;
  registry.managers.push({
    manager_id: args.managerId,
    owner,
    digest: args.digest,
    checkpoint_timestamp_ms: Date.now(),
    package: PREDICT.packageId,
  });
  writeRegistry(registry);
}
