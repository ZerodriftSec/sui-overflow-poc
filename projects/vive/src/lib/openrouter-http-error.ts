function readNestedErrorMessage(value: unknown): string | null {
  if (value instanceof Error) {
    return value.message || null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  // Prefer nested provider payloads over the generic "Provider returned error".
  const metadata = record.metadata;
  if (metadata && typeof metadata === "object") {
    const meta = metadata as Record<string, unknown>;
    for (const key of ["raw", "provider_error", "error", "message"] as const) {
      const nested = readNestedErrorMessage(meta[key]);
      if (nested && !/^provider returned error$/i.test(nested)) {
        return nested;
      }
    }
  }

  const directKeys = ["message", "error", "detail", "details"] as const;
  for (const key of directKeys) {
    const message = readNestedErrorMessage(record[key]);
    if (message) return message;
  }

  return null;
}

/** Extract a human-readable message from an OpenRouter HTTP error body. */
export function parseOpenRouterErrorBody(bodyText: string): string | null {
  const trimmed = bodyText.trim();
  if (!trimmed) return null;

  try {
    return readNestedErrorMessage(JSON.parse(trimmed) as unknown);
  } catch {
    return trimmed.length > 0 ? trimmed : null;
  }
}

export function formatOpenRouterHttpError(
  status: number,
  bodyText: string,
  context?: string,
): string {
  const detail = parseOpenRouterErrorBody(bodyText);
  const prefix = context ? `${context} ` : "";
  if (detail) {
    return `${prefix}OpenRouter error (${status}): ${detail}`;
  }
  if (bodyText.trim()) {
    return `${prefix}OpenRouter error (${status}): ${bodyText.slice(0, 500)}`;
  }
  return `${prefix}OpenRouter request failed (${status})`;
}

export function logOpenRouterHttpError(input: {
  operation: string;
  status: number;
  modelId?: string;
  bodyText: string;
}): void {
  const detail = parseOpenRouterErrorBody(input.bodyText);
  console.error(`[OpenRouter] ${input.operation} failed`, {
    status: input.status,
    model: input.modelId,
    message: detail,
    body: input.bodyText,
  });
}
