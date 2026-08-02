import { describe, expect, it } from "vitest";
import {
  callbackQueryUpdate,
  editedMessageUpdate,
  messageWithoutFromUpdate,
  newCommandUpdate,
  photoMessageUpdate,
  startCommandUpdate,
  stickerMessageUpdate,
  textMessageUpdate,
} from "./fixtures/telegram-updates.js";
import { parseUpdate } from "./update-parser.js";

describe("parseUpdate", () => {
  it("parses text message as supported with kind=text", () => {
    const result = parseUpdate(textMessageUpdate());
    expect(result).toMatchObject({
      kind: "supported",
      inboundKind: "text",
      text: "hello",
    });
  });

  it("parses /start command via bot_command entity", () => {
    const result = parseUpdate(startCommandUpdate());
    expect(result).toMatchObject({
      kind: "supported",
      inboundKind: "command",
      command: "start",
      resetRequested: false,
    });
  });

  it("parses /new command with resetRequested=true", () => {
    const result = parseUpdate(newCommandUpdate());
    expect(result).toMatchObject({
      kind: "supported",
      inboundKind: "command",
      command: "new",
      resetRequested: true,
    });
  });

  it("parses /new@BotName via entity", () => {
    const result = parseUpdate(newCommandUpdate("MyBot"));
    expect(result).toMatchObject({
      kind: "supported",
      inboundKind: "command",
      command: "new",
      resetRequested: true,
    });
  });

  it("marks photo message as unsupported", () => {
    const result = parseUpdate(photoMessageUpdate());
    expect(result).toEqual({
      kind: "unsupported",
      updateId: 4,
      chatId: 10,
    });
  });

  it("marks sticker as unsupported", () => {
    const result = parseUpdate(stickerMessageUpdate());
    expect(result.kind).toBe("unsupported");
  });

  it("marks edited_message as unsupported", () => {
    const result = parseUpdate(editedMessageUpdate());
    expect(result).toEqual({ kind: "unsupported", updateId: 6 });
  });

  it("marks message without from as unsupported", () => {
    const result = parseUpdate(messageWithoutFromUpdate());
    expect(result.kind).toBe("unsupported");
  });

  it("marks callback_query as unsupported", () => {
    const result = parseUpdate(callbackQueryUpdate());
    expect(result).toEqual({ kind: "unsupported", updateId: 7 });
  });
});
