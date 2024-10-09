import { Prisma } from "@prisma/client";

export enum TransactionType {
  DEPOSIT = "Deposit",
  WITHDRAW = "Withdraw",
  ZAP = "Zap",
  ZAP_SEND = "Zap Sent",
  AUTOFORWARD = "Autoforward",
  EARNINGS = "Earnings",
  TOPUP = "Top Up",
}

export enum PaymentType {
  Boost = 1,
  BoostWithComment = 2, // Deprecated, could be used for something else
  Reply = 3, // Deprecated, could be used for something else
  CommentBoost = 4, // Deprecated, could be used for something else
  Keysend = 5,
  Invoice = 6,
  Zap = 7,
  PartyMode = 8,
  BoostWithExternalTimeSplit = 9,
}
export interface NpubMetadata {
  publicHex: string;
  metadata: Prisma.JsonValue;
  followerCount: number;
  follows: Prisma.JsonValue;
}

export interface Follow extends Prisma.JsonArray {
  pubkey: string;
  relay?: string;
  petname?: string;
}

export enum IncomingInvoiceType {
  ExternalReceive = "external_receive",
  Transaction = "transaction",
  LNURL_Zap = "lnurl_zap",
  LNURL = "lnurl",
}

export const IncomingInvoiceTableMap: Record<
  IncomingInvoiceType,
  "transaction" | "external_receive"
> = {
  [IncomingInvoiceType.Transaction]: "transaction",
  [IncomingInvoiceType.ExternalReceive]: "external_receive",
  [IncomingInvoiceType.LNURL_Zap]: "transaction",
  [IncomingInvoiceType.LNURL]: "transaction",
};

export interface Promo {
  user: PromoUser;
  id: number;
  msatBudget: number;
  msatPayoutAmount: number;
  contentId: string;
  contentType: string;
}

export interface PromoUser {
  canEarnToday: boolean;
  lifetimeEarnings: number;
  earnedToday: number;
  earnableToday: number;
}
