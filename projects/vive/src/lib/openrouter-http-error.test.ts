import { describe, expect, test } from "bun:test";
import {
  formatOpenRouterHttpError,
  parseOpenRouterErrorBody,
} from "./openrouter-http-error";

describe("openrouter-http-error", () => {
  test("parseOpenRouterErrorBody reads nested error.message", () => {
    expect(
      parseOpenRouterErrorBody(
        JSON.stringify({
          error: {
            message: "Invalid aspect_ratio: 48:9",
            code: 400,
          },
        }),
      ),
    ).toBe("Invalid aspect_ratio: 48:9");
  });

  test("parseOpenRouterErrorBody prefers metadata.raw over generic provider message", () => {
    expect(
      parseOpenRouterErrorBody(
        JSON.stringify({
          error: {
            message: "Provider returned error",
            code: 400,
            metadata: {
              raw: "Content policy violation: unsafe content detected",
            },
          },
        }),
      ),
    ).toBe("Content policy violation: unsafe content detected");
  });

  test("formatOpenRouterHttpError includes status and detail", () => {
    expect(
      formatOpenRouterHttpError(
        400,
        JSON.stringify({ error: { message: "Provider rejected request" } }),
        "Storyboard image generation:",
      ),
    ).toBe(
      "Storyboard image generation: OpenRouter error (400): Provider rejected request",
    );
  });
});
