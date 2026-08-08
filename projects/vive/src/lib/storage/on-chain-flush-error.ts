export class OnChainFlushError extends Error {
  readonly retryable = true;
  readonly projectId: string;
  readonly insufficientBalance: boolean;

  constructor(projectId: string, cause: unknown) {
    const message = formatOnChainTransactionError(cause);
    super(message);
    this.name = "OnChainFlushError";
    this.projectId = projectId;
    this.insufficientBalance = isInsufficientSuiBalanceError(cause);
  }
}

export function isOnChainFlushError(error: unknown): error is OnChainFlushError {
  return error instanceof OnChainFlushError;
}

export function isInsufficientSuiBalanceError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  if (!message) return false;
  return (
    message.includes("insufficientcoinbalance") ||
    message.includes("insufficient coin") ||
    message.includes("insufficient gas") ||
    message.includes("gasbalancetoolow") ||
    message.includes("not enough sui") ||
    message.includes("not enough gas") ||
    message.includes("balance too low")
  );
}

export function formatOnChainTransactionError(error: unknown): string {
  const message = extractErrorMessage(error).trim();
  if (!message) {
    return "On-chain transaction failed.";
  }
  if (isInsufficientSuiBalanceError(error)) {
    return "Not enough SUI to complete the on-chain transaction. Add SUI to your wallet, then retry.";
  }
  if (message.toLowerCase().includes("user rejected") || message.includes("Rejected")) {
    return "Transaction was rejected in your wallet.";
  }
  return message;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") {
      return record.message;
    }
    if (typeof record.error === "string") {
      return record.error;
    }
  }
  return "";
}
