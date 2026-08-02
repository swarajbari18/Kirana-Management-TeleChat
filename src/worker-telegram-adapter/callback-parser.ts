export interface InlineKeyboardYesNo {
  inline_keyboard: Array<
    Array<{ text: string; callback_data: string }>
  >;
}

export function buildYesNoKeyboard(
  confirmationId: string,
): InlineKeyboardYesNo {
  return {
    inline_keyboard: [
      [
        { text: "Yes", callback_data: `confirm:${confirmationId}:yes` },
        { text: "No", callback_data: `confirm:${confirmationId}:no` },
      ],
    ],
  };
}

export function parseConfirmationCallbackData(
  data: string,
): { confirmationId: string; approved: boolean } | null {
  const match = /^confirm:([0-9a-f-]{36}):(yes|no)$/i.exec(data);
  if (!match) {
    return null;
  }
  return {
    confirmationId: match[1],
    approved: match[2].toLowerCase() === "yes",
  };
}
