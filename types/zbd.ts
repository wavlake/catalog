export interface sendPaymentPayload {
  description: string;
  amount: string;
  invoice: string;
  internalId: string;
  callbackUrl: string;
}

export interface sendPaymentResponse {
  success: boolean;
  message: string;
  data?: {
    id: string;
    fee: string;
    unit: string;
    amount: string;
    invoice: string;
    preimage: string;
    internalId: string;
    status: string;
    processedAt: string;
    confirmedAt: string;
    description: string;
  };
}
