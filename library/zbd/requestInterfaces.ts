interface TLV {
  type: string;
  value: string;
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
