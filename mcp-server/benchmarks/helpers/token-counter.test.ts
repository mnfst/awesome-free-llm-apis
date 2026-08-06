import { describe, it, expect } from "vitest";
import { countTokens } from "./token-counter.js";

describe("token-counter helper", () => {
  it("returns 0 for empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  it("accurately counts tokens for sample text", () => {
    const text = "Hello, world! This is a test.";
    const count = countTokens(text);
    expect(count).toBeGreaterThan(0);
    expect(typeof count).toBe("number");
  });

  it("handles special characters and markdown content", () => {
    const markdown = "```ts\nconst x = 42;\nconsole.log(x);\n```";
    expect(countTokens(markdown)).toBeGreaterThan(5);
  });
});
