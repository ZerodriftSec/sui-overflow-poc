function readNestedErrorMessage(value: unknown): string | null {
  if (value instanceof Error) {
    return value.message || null;
  }
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directKeys = ["message", "error", "detail", "details"] as const;
  for (const key of directKeys) {
    const message = readNestedErrorMessage(record[key]);
    if (message) return message;
  }

  return null;
}

export function formatProviderError(
  error: unknown,
  fallback = "Request failed",
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const baseMessage = error.message?.trim() || fallback;
  const record = error as unknown as Record<string, unknown>;

  const statusCode = record.statusCode;
  const statusText = record.statusText;
  const responseBody = record.responseBody;

  const nestedResponseMessage = readNestedErrorMessage(responseBody);
  if (nestedResponseMessage) {
    return nestedResponseMessage;
  }

  if (typeof responseBody === "string" && responseBody.trim().length > 0) {
    try {
      const parsed = JSON.parse(responseBody) as unknown;
      const parsedMessage = readNestedErrorMessage(parsed);
      if (parsedMessage) return parsedMessage;
      return responseBody.slice(0, 400);
    } catch {
      return responseBody.slice(0, 400);
    }
  }

  const nestedCauseMessage = readNestedErrorMessage(record.cause);
  if (nestedCauseMessage && nestedCauseMessage !== baseMessage) {
    return nestedCauseMessage;
  }

  const hasStatusCode = typeof statusCode === "number";
  const hasStatusText = typeof statusText === "string" && statusText.length > 0;
  if (hasStatusCode || hasStatusText) {
    return `${baseMessage}${hasStatusCode ? ` (${statusCode}` : " ("}${hasStatusText ? ` ${statusText}` : ""})`;
  }

  return baseMessage;
}
