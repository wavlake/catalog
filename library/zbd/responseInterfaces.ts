// These interfaces are used to define the response of the ZBD API

// Terminology:
// ZBD charge = lightning invoice
// ZBD Static Charge = LNURL Pay

interface BaseResponse {
  message?: string;
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

export interface ZBDCreateStaticChargeResponse extends BaseResponse {
  data: CommonDataFields & {
    slots: number;
    minAmount: string;
    maxAmount: string;
    allowedSlots: number;
    successMessage: string;
    invoice: InvoiceBasic;
  };
}

export interface ZBDCreateWithdrawalRequestResponse extends BaseResponse {
  success: boolean;
  data: CommonDataFields & {
    amount: string;
    fee: null;
    invoice: InvoiceExtended;
  };
}

export interface ZBDSendKeysendPaymentResponse extends BaseResponse {
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

export interface ZBDCreateChargeLightningResponse extends BaseResponse {
  success: boolean;
  data: CommonDataFields & {
    amount: string;
    confirmedAt: null;
    invoice: InvoiceBasic;
  };
}

export interface ZBDCreateChargeZBDResponse extends BaseResponse {
  success: boolean;
  data: CommonDataFields & {
    amount: string;
    invoiceRequest: string;
    invoiceExpiresAt: string;
    invoiceDescriptionHash: string | null;
  };
}

export interface ZBDPayToLightningAddressResponse extends BaseResponse {
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

export interface ZBDSendPaymentResponse extends BaseResponse {
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

export interface ZBDIsSupportedRegionResponse extends BaseResponse {
  success: boolean;
  data: {
    ipAddress?: string;
    isSupported: boolean;
    ipCountry?: string;
    ipRegion?: string;
  };
}
