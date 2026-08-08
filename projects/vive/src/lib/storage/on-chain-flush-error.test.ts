import { describe, expect, test } from "bun:test";
import {
  formatOnChainTransactionError,
  isInsufficientSuiBalanceError,
  OnChainFlushError,
} from "./on-chain-flush-error";

describe("on-chain-flush-error", () => {
  test("detects insufficient SUI balance errors", () => {
    expect(
      isInsufficientSuiBalanceError(
        new Error("Error checking transaction input objects: InsufficientCoinBalance"),
      ),
    ).toBe(true);
    expect(isInsufficientSuiBalanceError(new Error("not enough gas"))).toBe(true);
    expect(isInsufficientSuiBalanceError(new Error("Transaction failed."))).toBe(
      false,
    );
  });

  test("formats insufficient balance with retry guidance", () => {
    const message = formatOnChainTransactionError(
      new Error("InsufficientCoinBalance in command 0"),
    );
    expect(message).toContain("Not enough SUI");
    expect(message).toContain("retry");
  });

  test("OnChainFlushError carries project id and retryable flag", () => {
    const error = new OnChainFlushError(
      "0xabc",
      new Error("InsufficientCoinBalance"),
    );
    expect(error.retryable).toBe(true);
    expect(error.projectId).toBe("0xabc");
    expect(error.insufficientBalance).toBe(true);
  });
});
