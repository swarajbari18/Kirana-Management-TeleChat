import { describe, expect, it } from "vitest";
import { stripBotCommands } from "./strip-bot-commands.js";

describe("stripBotCommands", () => {
  it("strips /start command entity", () => {
    const result = stripBotCommands("/start", [
      { type: "bot_command", offset: 0, length: 6 },
    ]);
    expect(result).toBe("");
  });

  it("strips /new@Bot command entity", () => {
    const result = stripBotCommands("/new@MyBot extra text", [
      { type: "bot_command", offset: 0, length: 11 },
    ]);
    expect(result).toBe("extra text");
  });

  it("returns plain text unchanged when no entities", () => {
    expect(stripBotCommands("hello world", undefined)).toBe("hello world");
  });
});
