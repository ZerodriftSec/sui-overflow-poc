import fs from 'node:fs';
import path from 'node:path';

/**
 * Durable location for file-backed runtime stores (sim positions, PPN maturity,
 * distribution pools/positions).
 *
 * On Akash the container filesystem is EPHEMERAL — a restart wipes process.cwd(),
 * losing in-flight positions and the PPN maturity guard's records. Set STATE_DIR
 * to a mounted PERSISTENT volume (e.g. /app/state, declared in the Akash SDL) so
 * these stores survive a restart. Defaults to the working dir for local/dev.
 */
let ensured = false;
export function statePath(filename: string): string {
  const dir = process.env.STATE_DIR?.trim() || process.cwd();
  if (!ensured && dir !== process.cwd()) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* the volume mount normally creates it; best-effort */
    }
    ensured = true;
  }
  return path.resolve(dir, filename);
}
