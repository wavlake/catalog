const log = require("loglevel");
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import { validate } from "uuid";
import core = require("express-serve-static-core");
import { TLVRecord, ZBDKeysendCallback } from "@library/zbd/interfaces";
import { buildAmpTx } from "@library/amp";
import db from "@library/db";

const CONTENT_ID_RECORD = "säö\x00\x00\x00\x00\x00";
const METADATA_RECORD = "qit\x00\x00\x00\x00\x00";

const getRecordString = (tlvRecords: TLVRecord[] = [], type: string) => {
  if (tlvRecords.some((record) => record.type === type)) {
  Buffer.from(tlvRecords[type], "hex").toString();
};

const processIncomingKeysend = asyncHandler<
  core.ParamsDictionary,
  any,
  ZBDKeysendCallback
>(async (req, res, next) => {
  log.debug(`Keysend received`);
  const { amount, pubkey, metadata, tlvRecords } = req.body.data;

  // pull out the content id from the tlv records
  const contentId = "123-abc";

  if (!contentId || !validate(contentId)) {
    log.error("Did not find a valid content id in the tlv records");
    res.status(400);
    return;
  }

  const trx = await db.knex.transaction();

  buildAmpTx({
    res,
    trx,
    contentId,
    userId: metadata.userId,
    npub: metadata.npub,
    msatAmount: amount,
    contentTime: metadata.contentTime,
    type: metadata.type,
    settleIndex: null,
    preimage: null,
    rHashStr: null,
    comment: metadata.comment,
    isNostr: false,
    boostData: metadata.boostData,
    externalTxId: null,
    isNwc: false,
  })
});

const updateInvoice = asyncHandler(async (req, res, next) => {
  // TODO - update an invoice
  // the invoice status is expected to change from pending to success or fail
  res.status(200);
});

export default { processIncomingKeysend, updateInvoice };
