import type { MessageEntity } from "@grammyjs/types";

export interface ParsedCommand {
  command: string;
  resetRequested: boolean;
}

export function parseBotCommand(
  text: string,
  entities?: MessageEntity[],
): ParsedCommand | null {
  if (!entities) {
    return null;
  }

  const commandEntity = entities.find((entity) => entity.type === "bot_command");
  if (!commandEntity) {
    return null;
  }

  const rawCommand = text.slice(
    commandEntity.offset,
    commandEntity.offset + commandEntity.length,
  );

  const commandName = rawCommand.slice(1).split("@")[0];
  return {
    command: commandName,
    resetRequested: commandName === "new",
  };
}
