export interface ConfirmationCallbackRequest {
  storeId: string;
  confirmationId: string;
  approved: boolean;
  callbackQueryId: string;
  transport: {
    updateId: number;
    userId: number;
    timestamp: number;
  };
}
