import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | undefined;

export function getServiceVersion(): string {
  if (cached) return cached;
  const dir = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(dir, '../../package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const v = JSON.parse(raw) as { version?: string };
  cached = typeof v.version === 'string' ? v.version : '0.0.0';
  return cached;
}
