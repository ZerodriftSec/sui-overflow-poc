#!/usr/bin/env node
/**
 * Lint script to catch regressions where hardcoded "fake" data sneaks
 * back into the user-facing UI. Scans `src/` for the patterns that
 * appeared in the demo-readiness audit (Phase 0.6, 0.7) and treats
 * matches inside the user-facing dirs as failures.
 *
 * - `src/components/platform/`
 * - `src/components/subscriptions/`
 * - `src/pages/`
 *
 * Matches elsewhere in `src/` (shared lib code, mocks under `__mocks__`,
 * etc.) are still printed as warnings, but do not cause a non-zero exit.
 * `scripts/`, `tests/`, and the move sources are ignored entirely.
 *
 * Patterns flagged (kept narrow to avoid false positives):
 *   1. `Math.random()` calls
 *   2. Hardcoded chart arrays: 3+ integer literals in square brackets
 *      (matches the old `[420, 580, 720, 890, 1050, 1230]` shape)
 *   3. Literal `"2.1%"` (the old hardcoded churn rate)
 *   4. `now - 3600` or `Date.now() / 1000) - 3600` (the old fake
 *      `lastProcessedAt` pattern)
 *
 * Usage: node scripts/lint-no-fakes.mjs
 * Exit:  0 if clean, 1 if user-facing fakes were found.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(import.meta.url), "..", "..");
const srcDir = join(repoRoot, "src");

const USER_FACING_DIRS = [
  join("src", "components", "platform"),
  join("src", "components", "subscriptions"),
  join("src", "pages"),
];

const PATTERNS = [
  {
    name: "Math.random()",
    regex: /\bMath\.random\s*\(/,
  },
  {
    // Match hardcoded numeric arrays of 3+ elements: [1, 2, 3, ...]
    // Anchored to start of array with `[` to avoid matching tuple types
    // and array indexing.
    name: "hardcoded chart array",
    regex: /\[\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*\d+)+\s*\]/,
  },
  {
    name: 'hardcoded "2.1%"',
    regex: /"2\.1%"/,
  },
  {
    name: "fake timestamp (now - 3600)",
    regex: /\bnow\s*-\s*3600\b|\)\s*-\s*3600\b/,
  },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      yield full;
    }
  }
}

function isUserFacing(absPath) {
  const rel = relative(repoRoot, absPath).split(sep).join("/");
  return USER_FACING_DIRS.some(
    (d) => rel === d || rel.startsWith(d + "/"),
  );
}

const warnings = [];
const errors = [];

for (const file of walk(srcDir)) {
  const rel = relative(repoRoot, file);
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { name, regex } of PATTERNS) {
      if (regex.test(line)) {
        const entry = { file: rel, line: i + 1, pattern: name, text: line.trim() };
        if (isUserFacing(file)) {
          errors.push(entry);
        } else {
          warnings.push(entry);
        }
      }
    }
  }
}

function printEntries(entries, header) {
  if (entries.length === 0) return;
  console.log(`\n${header} (${entries.length}):`);
  for (const e of entries) {
    console.log(`  ${e.file}:${e.line}  [${e.pattern}]  ${e.text}`);
  }
}

if (warnings.length > 0) {
  printEntries(warnings, "Warnings (non-user-facing)");
}

if (errors.length > 0) {
  printEntries(errors, "ERRORS (user-facing fakes detected)");
  console.log(
    `\nlint:no-fakes failed: ${errors.length} fake-data ${errors.length === 1 ? "match" : "matches"} in user-facing code.`,
  );
  process.exit(1);
}

console.log("lint:no-fakes: clean — no hardcoded fake data in user-facing code.");
