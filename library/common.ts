import { Prisma } from "@prisma/client";

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

export enum IncomingInvoiceTypes {
  ExternalReceive = "external_receive",
  Transaction = "transaction",
  LNURL_Zap = "lnurl_zap",
  LNURL = "lnurl",
}

export const IncomingInvoiceTableMap: Record<
  IncomingInvoiceTypes,
  "transaction" | "external_receive"
> = {
  [IncomingInvoiceTypes.Transaction]: "transaction",
  [IncomingInvoiceTypes.ExternalReceive]: "external_receive",
  [IncomingInvoiceTypes.LNURL_Zap]: "transaction",
  [IncomingInvoiceTypes.LNURL]: "transaction",
};
