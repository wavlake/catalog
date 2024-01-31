export interface CreateInvoiceRequest {
  description: string;
  amount: string;
  expiresIn: number;
  internalId: string;
}

export interface InvoiceResponse {
  request: string;
  uri: string;
}

export interface SendKeysendRequest {
  amount: string;
  pubkey: string;
  metadata?: object;
  tlvRecords?: any[];
}

export interface SendKeysendResponse {
  success: boolean;
  message: string;
  data?: {
    keysendId: string;
    paymentId: string;
    transaction: {
      id: string;
      walletId: string;
      type: string;
      totalAmount: string;
      fee: string;
      amount: string;
      description: string;
      status: string;
      confirmedAt: string;
    };
  };
}

export interface SendPaymentRequest {
  description: string;
  amount: string;
  invoice: string;
  internalId: string;
}

export interface SendPaymentResponse {
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
