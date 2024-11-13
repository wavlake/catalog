import { Prisma } from "@prisma/client";
import { TrackInfo } from "@prisma/client";

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
  Promo = "promo",
}

export const IncomingInvoiceTableMap: Record<
  IncomingInvoiceType,
  "transaction" | "external_receive" | "promo"
> = {
  [IncomingInvoiceType.Transaction]: "transaction",
  [IncomingInvoiceType.ExternalReceive]: "external_receive",
  [IncomingInvoiceType.LNURL_Zap]: "transaction",
  [IncomingInvoiceType.LNURL]: "transaction",
  [IncomingInvoiceType.Promo]: "promo",
};

export type PromoResponseData = {
  promoUser: PromoResponseUser;
  id: number;
  msatBudget: number;
  msatPayoutAmount: number;
  contentId: string;
  contentType: string;
  contentMetadata?: TrackInfo;
};

export type PromoResponseUser = {
  canEarnToday: boolean;
  lifetimeEarnings: number;
  earnedToday: number;
  earnableToday: number;
  cumulativeEarnedToday: number;
};
