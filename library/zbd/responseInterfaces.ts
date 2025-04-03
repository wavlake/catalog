// responseInterfaces.ts
import { ChargeStatus, PaymentStatus, TransactionStatus } from "./constants";

// Base response interfaces using discriminated union pattern
export interface ZBDSuccessResponse<T> {
  success: true;
  message?: string;
  data: T;
}

export interface ZBDErrorResponse {
  success: false;
  message?: string;
}

// Common type for fields shared across multiple response types
export interface CommonDataFields {
  id: string;
  unit: string;
  createdAt: string;
  expiresAt: string | null;
  internalId: string;
  description: string;
  callbackUrl: string;
  status: PaymentStatus | ChargeStatus;
}

// Invoice types
export interface InvoiceBasic {
  request: string;
  uri: string;
}

export interface InvoiceExtended extends InvoiceBasic {
  fastRequest?: string;
  fastUri?: string;
}

// Specific response type definitions
export type ZBDCreateStaticChargeResponse =
  | ZBDSuccessResponse<
      CommonDataFields & {
        slots: number;
        minAmount: string;
        maxAmount: string;
        allowedSlots: number;
        successMessage: string;
        invoice: InvoiceBasic;
      }
    >
  | ZBDErrorResponse;

export type ZBDCreateWithdrawalRequestResponse =
  | ZBDSuccessResponse<
      CommonDataFields & {
        amount: string;
        fee: null;
        invoice: InvoiceExtended;
      }
    >
  | ZBDErrorResponse;

export type ZBDSendKeysendPaymentResponse =
  | ZBDSuccessResponse<{
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
        status: TransactionStatus;
        confirmedAt: string | null;
      };
    }>
  | ZBDErrorResponse;

export type ZBDCreateChargeLightningResponse =
  | ZBDSuccessResponse<
      CommonDataFields & {
        amount: string;
        confirmedAt: null;
        invoice: InvoiceBasic;
      }
    >
  | ZBDErrorResponse;

export type ZBDCreateChargeResponse =
  | ZBDSuccessResponse<
      CommonDataFields & {
        amount: string;
        invoiceRequest: string;
        invoiceExpiresAt: string;
        invoiceDescriptionHash: string | null;
      }
    >
  | ZBDErrorResponse;

export type ZBDGetChargeResponse =
  | ZBDSuccessResponse<
      CommonDataFields & {
        amount: string;
        confirmedAt: string | null;
        invoice: InvoiceBasic;
      }
    >
  | ZBDErrorResponse;

export type ZBDPayToLightningAddressResponse =
  | ZBDSuccessResponse<
      CommonDataFields & {
        fee: string;
        amount: string;
        invoice: string;
        preimage: string | null;
        walletId: string;
        transactionId: string;
        comment: string;
        processedAt: string;
      }
    >
  | ZBDErrorResponse;

export type ZBDSendPaymentResponse =
  | ZBDSuccessResponse<
      CommonDataFields & {
        fee: string;
        amount: string;
        invoice: string;
        preimage: string;
        processedAt: string;
        confirmedAt: string;
      }
    >
  | ZBDErrorResponse;

export type ZBDIsSupportedRegionResponse =
  | ZBDSuccessResponse<{
      ipAddress?: string;
      isSupported: boolean;
      ipCountry?: string;
      ipRegion?: string;
    }>
  | ZBDErrorResponse;

export type ZBDWalletResponse =
  | ZBDSuccessResponse<{
      unit: string;
      balance: string;
    }>
  | ZBDErrorResponse;
