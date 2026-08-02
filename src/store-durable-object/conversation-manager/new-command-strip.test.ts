import { describe, expect, it } from "vitest";
import { stripNewCommand } from "./new-command-strip.js";

describe("stripNewCommand", () => {
  it("strips bare /new to empty string", () => {
    expect(stripNewCommand("/new")).toBe("");
  });

  it("strips /new with trailing text", () => {
    expect(stripNewCommand("/new hello")).toBe("hello");
  });

  it("strips /new@BotName to empty string", () => {
    expect(stripNewCommand("/new@MyBot")).toBe("");
  });

  it("strips /new@BotName with trailing text", () => {
    expect(stripNewCommand("/new@MyBot hello")).toBe("hello");
  });
});
