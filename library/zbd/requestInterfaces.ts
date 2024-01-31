interface TLV {
  type: string;
  value: string;
}

export interface CreateInvoiceRequest {
  description: string;
  amount: string;
  expiresIn: number;
  internalId: string;
}

export interface CreateInvoiceRequest {
  description: string;
  amount: string;
  expiresIn: number;
  internalId: string;
}

export interface SendKeysendRequest {
  amount: string;
  pubkey: string;
  metadata?: object;
  tlvRecords?: TLV[];
}

export interface SendPaymentRequest {
  description: string;
  amount: string;
  invoice: string;
  internalId: string;
}

export interface ZBDKeysendCallbackRequest {
  transaction: {
    id;
    type;
    flow;
    unit;
    status;
    fee;
    amount;
    walletId;
    entityId;
    invoiceId;
    totalAmount;
    description;
    confirmedAt;
    totalAmountUsd;
    invoiceRequest;
    updatedAt;
    createdAt;
  };
  keysendData: {
    paymentHash: string;
    preimage: string;
    receivedAmount: string;
    cltvDelta: number;
    bolt11?: string;
    tlvRecords?: TLV[];
    description: string;
    createdAt: string;
    confirmedAt?: string;
    expiresAt: string;
  };
}
