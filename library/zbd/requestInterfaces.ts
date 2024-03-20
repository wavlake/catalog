import { ChargeStatus, PaymentStatus, TransactionStatus } from "./constants";

interface TLV {
  type: string;
  value: string;
}

export interface CreateInvoiceRequest {
  description?: string;
  amount: string;
  expiresIn: number;
  internalId: string;
  descriptionHash?: string;
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
    id: string;
    type: string;
    flow: any;
    unit: any;
    status: TransactionStatus;
    fee: any;
    amount: any;
    walletId: any;
    entityId: any;
    invoiceId: any;
    totalAmount: any;
    description: any;
    confirmedAt: any;
    totalAmountUsd: any;
    invoiceRequest: any;
    updatedAt: any;
    createdAt: any;
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

export interface ZBDChargeCallbackRequest {
  unit: string;
  amount: string;
  confirmedAt: string;
  status: ChargeStatus;
  description: string;
  createdAt: string;
  expiresAt: string;
  id: string;
  internalId: string;
  callbackUrl: string;
  invoice: {
    request: string;
    uri: string;
  };
}

export interface ZBDPaymentCallbackRequest {
  id: string;
  fee: string;
  unit: string;
  amount: string;
  invoice: string;
  preimage: string;
  internalId: string;
  processedAt: string;
  confirmedAt: string;
  description: string;
  status: PaymentStatus;
}
