import type { MessageEntity } from "@grammyjs/types";
import { stripNewCommand } from "./new-command-strip.js";

export function stripBotCommands(
  text: string,
  entities?: MessageEntity[],
): string {
  if (!entities || entities.length === 0) {
    return text;
  }

  const commandEntities = entities
    .filter((entity) => entity.type === "bot_command")
    .sort((a, b) => a.offset - b.offset);

  if (commandEntities.length === 0) {
    return text;
  }

  let result = "";
  let cursor = 0;

  for (const entity of commandEntities) {
    result += text.slice(cursor, entity.offset);
    cursor = entity.offset + entity.length;
  }
  result += text.slice(cursor);

  return result.trim();
}

export function buildContextText(
  text: string,
  entities: MessageEntity[] | undefined,
  command?: string,
): string {
  if (command === "new") {
    return stripNewCommand(text);
  }
  return stripBotCommands(text, entities);
}
