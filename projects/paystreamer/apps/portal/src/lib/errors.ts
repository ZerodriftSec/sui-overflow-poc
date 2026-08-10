export const ERROR_MESSAGES: Record<string, string> = {
  // Account errors
  "0x01001": "This account cap doesn't match your wallet. Try refreshing the page.",
  "0x01003": "This account is closed. Create a new account to continue.",
  "0x01005": "Insufficient SUI balance. Please deposit more funds to continue.",
  "0x01006": "This token type isn't supported. Please use SUI or USDC.",
  "0x01007": "Account not found. Please create an account first.",

  // Subscription errors
  "0x06003": "You're already subscribed to this platform.",
  "0x06004": "This subscription is not active. Please check your subscription status.",
  "0x06005": "Subscription limit reached. Please contact the platform.",
  "0x06006": "Your account is paused. Resume it from your dashboard to continue.",

  // Tier errors
  "0x08002": "This tier doesn't exist or has been deactivated. Please select a different tier.",
  "0x08003": "This tier is not accepting new subscribers.",

  // Payment errors
  "0x09001": "This subscription isn't due for billing yet. Check back later.",
  "0x09003": "Insufficient balance for this payment. Please deposit funds.",
  "0x09004": "Payment failed. Please try again or contact support.",

  // System errors
  "0x0A001": "Payment processing is temporarily paused. Try again in a few minutes.",
  "0x0A002": "Payments are paused by the platform administrator.",
  "0x0A003": "Transaction timed out. Please try again.",

  // Authorization errors
  "unauthorized": "You're not authorized to perform this action.",
  "forbidden": "This action is not allowed.",
};

export function getErrorMessage(error: unknown): string {
  console.error("[getErrorMessage] Original error:", error);
  if (error instanceof Error) {
    const match = error.message.match(/0x[0-9A-Fa-f]+/);
    if (match) {
      const code = match[0].toUpperCase();
      if (ERROR_MESSAGES[code]) {
        return ERROR_MESSAGES[code];
      }
      const lowerCode = match[0].toLowerCase();
      if (ERROR_MESSAGES[lowerCode]) {
        return ERROR_MESSAGES[lowerCode];
      }
    }
    if (error.message.includes("Insufficient balance") || error.message.includes("balance too low")) {
      return ERROR_MESSAGES["0x01005"];
    }
    if (error.message.includes("already subscribed")) {
      return ERROR_MESSAGES["0x06003"];
    }
    if (error.message.toLowerCase().includes("gas") || error.message.includes("find a coin") || error.message.includes("resolve gas")) {
      return "Not enough SUI to pay for transaction fees. Please add funds from the devnet faucet.";
    }
    if (error.message.includes("expiry")) {
      return ERROR_MESSAGES["0x0A003"];
    }
    return `Transaction failed: ${error.message}`;
  }
  return "Something went wrong. Please try again.";
}

export function parseMoveError(error: unknown): string {
  if (error instanceof Error) {
    const message = getErrorMessage(error);
    if (message !== "Something went wrong. Please try again.") {
      return message;
    }

    if (error.message.includes("Insufficient coin balance")) {
      return "Insufficient balance: Not enough SUI for this transaction. Please add funds.";
    }
    if (error.message.includes("move_call")) {
      return "Transaction failed: Something went wrong with the contract call. Please try again.";
    }
    if (error.message.includes("type argument mismatch")) {
      return "Transaction failed: Invalid token type. Please use SUI or USDC.";
    }
    if (error.message.includes("argument mismatch")) {
      return "Transaction failed: Invalid arguments. Please check your input.";
    }
    if (error.message.includes("balance too low")) {
      return "Insufficient balance: Not enough SUI for this transaction.";
    }
    if (error.message.includes("object not found")) {
      return "Object not found: The data may have changed. Please refresh the page.";
    }
    if (error.message.includes("digest not found")) {
      return "Transaction not found: It may still be processing. Check your activity later.";
    }

    return error.message;
  }

  return "Something went wrong. Please try again.";
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const nonRetryable = [
      "already subscribed",
      "not enough gas",
      "account cap",
      "type argument mismatch",
      "forbidden",
      "unauthorized",
    ];
    return !nonRetryable.some(msg => error.message.toLowerCase().includes(msg));
  }
  return true;
}