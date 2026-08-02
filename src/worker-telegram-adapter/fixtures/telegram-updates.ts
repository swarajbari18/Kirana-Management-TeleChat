import type { Update } from "@grammyjs/types";
import {
  FIXTURE_CHAT_ID,
  FIXTURE_MINIMAL_CHAT_ID,
  FIXTURE_MINIMAL_USER_ID,
  FIXTURE_USER_ID,
} from "./test-identities.js";

export function textMessageUpdate(
  overrides: Partial<{
    updateId: number;
    messageId: number;
    chatId: number;
    userId: number;
    text: string;
    date: number;
  }> = {},
): Update {
  const updateId = overrides.updateId ?? 1;
  const messageId = overrides.messageId ?? 1;
  const chatId = overrides.chatId ?? FIXTURE_MINIMAL_CHAT_ID;
  const userId = overrides.userId ?? FIXTURE_MINIMAL_USER_ID;
  const text = overrides.text ?? "hello";
  const date = overrides.date ?? 1;

  return {
    update_id: updateId,
    message: {
      message_id: messageId,
      date,
      chat: { id: chatId, type: "private", first_name: "Test" },
      from: { id: userId, is_bot: false, first_name: "Test" },
      text,
    },
  };
}

export function startCommandUpdate(
  overrides: Partial<{
    updateId: number;
    messageId: number;
    chatId: number;
    userId: number;
    date: number;
  }> = {},
): Update {
  const updateId = overrides.updateId ?? 2;
  const messageId = overrides.messageId ?? 2;
  const chatId = overrides.chatId ?? FIXTURE_CHAT_ID;
  const userId = overrides.userId ?? FIXTURE_USER_ID;
  const date = overrides.date ?? 2;

  return {
    update_id: updateId,
    message: {
      message_id: messageId,
      date,
      chat: { id: chatId, type: "private", first_name: "Test" },
      from: { id: userId, is_bot: false, first_name: "Test" },
      text: "/start",
      entities: [{ type: "bot_command", offset: 0, length: 6 }],
    },
  };
}

export function newCommandUpdate(
  botName?: string,
  overrides: Partial<{
    updateId: number;
    messageId: number;
    chatId: number;
    userId: number;
    date: number;
  }> = {},
): Update {
  const text = botName ? `/new@${botName}` : "/new";
  const updateId = overrides.updateId ?? 3;
  const messageId = overrides.messageId ?? 3;
  const chatId = overrides.chatId ?? FIXTURE_CHAT_ID;
  const userId = overrides.userId ?? FIXTURE_USER_ID;
  const date = overrides.date ?? 3;

  return {
    update_id: updateId,
    message: {
      message_id: messageId,
      date,
      chat: { id: chatId, type: "private", first_name: "Test" },
      from: { id: userId, is_bot: false, first_name: "Test" },
      text,
      entities: [{ type: "bot_command", offset: 0, length: text.length }],
    },
  };
}

export function photoMessageUpdate(
  overrides: Partial<{
    updateId: number;
    messageId: number;
    chatId: number;
    userId: number;
    date: number;
  }> = {},
): Update {
  const updateId = overrides.updateId ?? 4;
  const messageId = overrides.messageId ?? 4;
  const chatId = overrides.chatId ?? FIXTURE_CHAT_ID;
  const userId = overrides.userId ?? FIXTURE_USER_ID;
  const date = overrides.date ?? 4;

  return {
    update_id: updateId,
    message: {
      message_id: messageId,
      date,
      chat: { id: chatId, type: "private", first_name: "Test" },
      from: { id: userId, is_bot: false, first_name: "Test" },
      photo: [
        { file_id: "small", width: 90, height: 90, file_unique_id: "u1" },
      ],
    },
  };
}

export function stickerMessageUpdate(): Update {
  return {
    update_id: 5,
    message: {
      message_id: 5,
      date: 5,
      chat: { id: FIXTURE_CHAT_ID, type: "private", first_name: "Test" },
      from: { id: FIXTURE_USER_ID, is_bot: false, first_name: "Test" },
      sticker: {
        file_id: "sticker",
        file_unique_id: "u2",
        width: 512,
        height: 512,
        is_animated: false,
        is_video: false,
        type: "regular",
      },
    },
  };
}

export function editedMessageUpdate(): Update {
  return {
    update_id: 6,
    edited_message: {
      message_id: 6,
      date: 6,
      edit_date: 7,
      chat: { id: FIXTURE_CHAT_ID, type: "private", first_name: "Test" },
      from: { id: FIXTURE_USER_ID, is_bot: false, first_name: "Test" },
      text: "edited",
    },
  };
}

export function callbackQueryUpdate(): Update {
  return {
    update_id: 7,
    callback_query: {
      id: "cq1",
      from: { id: FIXTURE_USER_ID, is_bot: false, first_name: "Test" },
      chat_instance: "ci",
      data: "data",
    },
  };
}

export function messageWithoutFromUpdate(): Update {
  return {
    update_id: 8,
    message: {
      message_id: 8,
      date: 8,
      chat: { id: FIXTURE_CHAT_ID, type: "private", first_name: "Test" },
      text: "hello",
    },
  } as Update;
}
