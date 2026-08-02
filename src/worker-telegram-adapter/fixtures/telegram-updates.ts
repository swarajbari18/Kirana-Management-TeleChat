import type { Update } from "@grammyjs/types";

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
  const chatId = overrides.chatId ?? 1;
  const userId = overrides.userId ?? 1;
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

export function startCommandUpdate(): Update {
  return {
    update_id: 2,
    message: {
      message_id: 2,
      date: 2,
      chat: { id: 10, type: "private", first_name: "Test" },
      from: { id: 12345, is_bot: false, first_name: "Test" },
      text: "/start",
      entities: [{ type: "bot_command", offset: 0, length: 6 }],
    },
  };
}

export function newCommandUpdate(botName?: string): Update {
  const text = botName ? `/new@${botName}` : "/new";
  return {
    update_id: 3,
    message: {
      message_id: 3,
      date: 3,
      chat: { id: 10, type: "private", first_name: "Test" },
      from: { id: 12345, is_bot: false, first_name: "Test" },
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
  const chatId = overrides.chatId ?? 10;
  const userId = overrides.userId ?? 12345;
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
      chat: { id: 10, type: "private", first_name: "Test" },
      from: { id: 12345, is_bot: false, first_name: "Test" },
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
      chat: { id: 10, type: "private", first_name: "Test" },
      from: { id: 12345, is_bot: false, first_name: "Test" },
      text: "edited",
    },
  };
}

export function callbackQueryUpdate(): Update {
  return {
    update_id: 7,
    callback_query: {
      id: "cq1",
      from: { id: 12345, is_bot: false, first_name: "Test" },
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
      chat: { id: 10, type: "private", first_name: "Test" },
      text: "hello",
    },
  } as Update;
}
