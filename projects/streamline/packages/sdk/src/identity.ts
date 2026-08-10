/**
 * Pure helpers for StreamLine usernames (SuiNS subnames).
 * User-facing form: `name@streamline`. Canonical: `name.streamline.sui`.
 */

export type ParsedHandle = { username: string; raw: string };

/** Lowercase a-z, 0-9, hyphen. 3–20 chars. No leading/trailing hyphen. */
export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?$/;

/** Reserved usernames that no user may claim. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin",
  "streamline",
  "support",
  "help",
  "api",
  "www",
  "root",
  "team",
  "system",
  "null",
  "me",
  "you",
  "owner",
  "operator",
  "billing",
  "security",
  "abuse",
  "info",
  "contact",
  "legal",
  "privacy",
  "app",
  "wallet",
  "vault",
  "send",
  "claim",
  "pro",
]);

function envDomain(): string {
  if (typeof process !== "undefined" && process.env) {
    const raw =
      process.env.STREAMLINE_SUINS_DOMAIN?.trim().toLowerCase() ||
      process.env.NEXT_PUBLIC_SUINS_DOMAIN?.trim().toLowerCase();
    if (raw) return raw.endsWith(".sui") ? raw : `${raw}.sui`;
  }
  return "streamline.sui";
}

/** Parent domain, e.g. `streamline.sui`. */
export function suinsDomain(override?: string): string {
  if (override) {
    const raw = override.trim().toLowerCase();
    return raw.endsWith(".sui") ? raw : `${raw}.sui`;
  }
  return envDomain();
}

/** Brand label without `.sui`, e.g. `streamline`. */
export function suinsBrand(override?: string): string {
  return suinsDomain(override).replace(/\.sui$/, "");
}

export function suinsConfigured(): boolean {
  return true;
}

/** True if the input looks like a Sui address (0x + 64 hex chars). */
export function isHexAddress(input: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(input.trim());
}

export type NormalizeResult =
  | { ok: true; handle: string }
  | {
      ok: false;
      reason:
        | "empty"
        | "too_short"
        | "too_long"
        | "charset"
        | "reserved";
    };

/**
 * Strip wrappers (`@`, `@streamline`, `.streamline.sui`), lowercase, validate.
 */
export function normalizeHandle(
  raw: unknown,
  domainOverride?: string
): NormalizeResult {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  let s = raw.trim().toLowerCase();
  if (!s) return { ok: false, reason: "empty" };

  if (s.startsWith("@")) s = s.slice(1);

  const brand = suinsBrand(domainOverride);
  const domain = suinsDomain(domainOverride);

  if (s.endsWith(`@${domain}`)) s = s.slice(0, -(`@${domain}`.length));
  if (s.endsWith(`@${brand}`)) s = s.slice(0, -(`@${brand}`.length));
  if (s.endsWith(`.${domain}`)) s = s.slice(0, -(`.${domain}`.length));

  if (s.length === 0) return { ok: false, reason: "empty" };
  if (s.length < 3) return { ok: false, reason: "too_short" };
  if (s.length > 20) return { ok: false, reason: "too_long" };
  if (!USERNAME_RE.test(s)) return { ok: false, reason: "charset" };
  if (RESERVED_USERNAMES.has(s)) return { ok: false, reason: "reserved" };
  return { ok: true, handle: s };
}

export function formatHandle(username: string, domainOverride?: string): string {
  return `${username}@${suinsBrand(domainOverride)}`;
}

export function isStreamlineHandle(
  value: string,
  domainOverride?: string
): boolean {
  const s = value.trim().toLowerCase();
  if (!s) return false;
  const brand = suinsBrand(domainOverride);
  const domain = suinsDomain(domainOverride);
  return (
    s.endsWith(`@${brand}`) ||
    s.endsWith(`.${domain}`) ||
    s.endsWith(`@${domain}`)
  );
}

export function bareHandleFromName(
  name: string,
  domainOverride?: string
): string | null {
  let s = name.trim().toLowerCase();
  if (!s) return null;
  const brand = suinsBrand(domainOverride);
  const domain = suinsDomain(domainOverride);
  if (s.startsWith("@")) s = s.slice(1);
  if (s.endsWith(`@${domain}`)) s = s.slice(0, -(`@${domain}`.length));
  else if (s.endsWith(`@${brand}`)) s = s.slice(0, -(`@${brand}`.length));
  else if (s.endsWith(`.${domain}`)) s = s.slice(0, -(`.${domain}`.length));
  else if (s.includes("@")) s = s.split("@")[0] ?? s;
  const parsed = normalizeHandle(s, domainOverride);
  return parsed.ok ? parsed.handle : null;
}

export function enokiNameMatchesSubname(
  enokiName: string,
  subname: string,
  domainOverride?: string
): boolean {
  const bare = bareHandleFromName(enokiName, domainOverride);
  return bare === subname.trim().toLowerCase();
}

export function formatSuins(username: string, domainOverride?: string): string {
  return `${username}.${suinsDomain(domainOverride)}`;
}

export function normalizeReasonMessage(
  reason: Exclude<NormalizeResult, { ok: true }>["reason"]
): string {
  switch (reason) {
    case "empty":
      return "Enter a handle.";
    case "too_short":
      return "Handles need at least 3 characters.";
    case "too_long":
      return "Handles are up to 20 characters.";
    case "charset":
      return "Letters, numbers, and hyphens only. No leading or trailing hyphen.";
    case "reserved":
      return "That handle is reserved.";
  }
}

export type ResolvedRecipient = {
  address: string;
  displayName: string;
  /** Bare username when resolved via StreamLine / SuiNS; null for raw hex. */
  handle: string | null;
};

export type NameServiceClient = {
  resolveNameServiceAddress: (input: {
    name: string;
  }) => Promise<string | null>;
  resolveNameServiceNames?: (input: {
    address: string;
  }) => Promise<{ data?: string[] }>;
};

/** Ordered SuiNS lookup candidates for a typed input. */
export function candidateSuinsNames(
  raw: string,
  domainOverride?: string
): string[] {
  let s = raw.trim().toLowerCase();
  if (!s) return [];
  if (s.startsWith("@")) s = s.slice(1);

  const brand = suinsBrand(domainOverride);
  const domain = suinsDomain(domainOverride);

  if (s.endsWith(`@${domain}`)) {
    const bare = s.slice(0, -(`@${domain}`.length));
    return USERNAME_RE.test(bare) ? [formatSuins(bare, domainOverride)] : [];
  }
  if (s.endsWith(`@${brand}`)) {
    const bare = s.slice(0, -(`@${brand}`.length));
    return USERNAME_RE.test(bare) ? [formatSuins(bare, domainOverride)] : [];
  }
  if (s.endsWith(`.${domain}`)) {
    return [s];
  }
  if (s.endsWith(".sui")) {
    return [s];
  }

  const parsed = normalizeHandle(s, domainOverride);
  if (parsed.ok) {
    return [
      formatSuins(parsed.handle, domainOverride),
      `${parsed.handle}.sui`,
    ];
  }
  if (/^[a-z0-9](?:[a-z0-9-]{0,18}[a-z0-9])?$/.test(s) && s.length >= 1) {
    return [`${s}.${domain}`, `${s}.sui`];
  }
  return [];
}

/**
 * Resolve a user-typed recipient to a Sui address.
 * Accepts hex, StreamLine handles, and any `.sui` name.
 */
export async function resolveRecipient(
  client: NameServiceClient,
  input: string,
  domainOverride?: string
): Promise<ResolvedRecipient | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (isHexAddress(trimmed)) {
    return {
      address: trimmed.toLowerCase(),
      displayName: trimmed,
      handle: null,
    };
  }

  for (const name of candidateSuinsNames(trimmed, domainOverride)) {
    try {
      const address = await client.resolveNameServiceAddress({ name });
      if (address) {
        const domain = suinsDomain(domainOverride);
        const handle = name.endsWith(`.${domain}`)
          ? name.slice(0, -(`.${domain}`.length))
          : null;
        return {
          address,
          displayName: handle
            ? formatHandle(handle, domainOverride)
            : name,
          handle,
        };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function reverseResolveHandle(
  client: NameServiceClient,
  address: string,
  domainOverride?: string
): Promise<string | null> {
  if (!isHexAddress(address) || !client.resolveNameServiceNames) return null;
  try {
    const page = await client.resolveNameServiceNames({ address });
    const names = page.data ?? [];
    if (names.length === 0) return null;

    const domain = suinsDomain(domainOverride);
    const branded = names.find((n) => n.endsWith(`.${domain}`));
    if (branded) {
      const bare = branded.slice(0, -(`.${domain}`.length));
      return formatHandle(bare, domainOverride);
    }
    return names[0] ?? null;
  } catch {
    return null;
  }
}

export async function isHandleTakenOnChain(
  client: NameServiceClient,
  handle: string,
  domainOverride?: string
): Promise<boolean> {
  const name = formatSuins(handle, domainOverride);
  try {
    const address = await client.resolveNameServiceAddress({ name });
    return !!address;
  } catch {
    return false;
  }
}
