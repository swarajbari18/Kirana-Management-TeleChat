import { describe, expect, it } from "vitest";
import { parseBotCommand } from "./command-parser.js";

describe("parseBotCommand", () => {
  it("extracts command from entity offset/length", () => {
    const result = parseBotCommand("/start", [
      { type: "bot_command", offset: 0, length: 6 },
    ]);
    expect(result).toEqual({ command: "start", resetRequested: false });
  });

  it("parses /help@botname as help", () => {
    const text = "/help@botname";
    const result = parseBotCommand(text, [
      { type: "bot_command", offset: 0, length: text.length },
    ]);
    expect(result).toEqual({ command: "help", resetRequested: false });
  });

  it("returns null for text without entities", () => {
    expect(parseBotCommand("hello", undefined)).toBeNull();
    expect(parseBotCommand("hello", [])).toBeNull();
  });

  it("sets resetRequested for /new command", () => {
    const result = parseBotCommand("/new", [
      { type: "bot_command", offset: 0, length: 4 },
    ]);
    expect(result).toEqual({ command: "new", resetRequested: true });
  });
});
