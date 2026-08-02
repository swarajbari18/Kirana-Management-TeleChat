export interface ConversationTurn {
  id: string;
  contextText: string;
  rawText: string;
  role: string;
  createdAt: string;
}

export interface ConversationContext {
  activeSessionId: string;
  turns: ConversationTurn[];
  storeInitialized: boolean;
}
