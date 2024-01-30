interface BaseResponse {
  success?: boolean;
  message: string;
}

interface CommonDataFields {
  id: string;
  unit: string;
  createdAt: string;
  expiresAt: string | null;
  internalId: string;
  description: string;
  callbackUrl: string;
  status: string;
}

interface InvoiceBasic {
  request: string;
  uri: string;
}

interface InvoiceExtended extends InvoiceBasic {
  fastRequest?: string;
  fastUri?: string;
}

export interface ZBDCreateStaticCharge extends BaseResponse {
  data: CommonDataFields & {
    slots: number;
    minAmount: string;
    maxAmount: string;
    allowedSlots: number;
    successMessage: string;
    invoice: InvoiceBasic;
  };
}

export interface ZBDCreateWithdrawalRequest extends BaseResponse {
  success: boolean;
  data: CommonDataFields & {
    amount: string;
    fee: null;
    invoice: InvoiceExtended;
  };
}

export interface ZBDSendKeysendPayment extends BaseResponse {
  success: boolean;
  data: {
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
      confirmedAt: string | null;
    };
  };
}

export interface ZBDCreateChargeLightning extends BaseResponse {
  success: boolean;
  data: CommonDataFields & {
    amount: string;
    confirmedAt: null;
    invoice: InvoiceBasic;
  };
}

export interface ZBDCreateChargeZBD extends BaseResponse {
  success: boolean;
  data: CommonDataFields & {
    amount: string;
    invoiceRequest: string;
    invoiceExpiresAt: string;
    invoiceDescriptionHash: string | null;
  };
}

export interface ZBDPayToLightningAddress extends BaseResponse {
  success: boolean;
  data: CommonDataFields & {
    fee: string;
    amount: string;
    invoice: string;
    preimage: string | null;
    walletId: string;
    transactionId: string;
    comment: string;
    processedAt: string;
  };
}

export interface ZBDSendPayment extends BaseResponse {
  success: boolean;
  data: CommonDataFields & {
    fee: string;
    amount: string;
    invoice: string;
    preimage: string;
    processedAt: string;
    confirmedAt: string;
  };
}
