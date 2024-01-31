const log = require("loglevel");
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import { validate } from "uuid";
import core from "express-serve-static-core";
import { ZBDKeysendCallback } from "@library/zbd/interfaces";
import { buildAmpTx } from "@library/amp";
import db from "@library/db";
import { KeysendMetadata } from "@library/keysend";

const jsonParser = (jsonString?: string) => {
  if (!jsonString) return;
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    log.debug("Error parsing json", e);
    return null;
  }
};

const BLIP0010 = "7629169";
const WAVLAKE_CUSTOM_KEY = "16180339";
const processIncomingKeysend = asyncHandler<
  core.ParamsDictionary,
  any,
  ZBDKeysendCallback
>(async (req, res, next) => {
  log.debug(`Keysend received`);

  const { amount, pubkey, metadata, tlvRecords } = req.body.data;

  const metaDataRecord = tlvRecords.find((record) => record.type === BLIP0010);
  const maybeContentIdRecord = tlvRecords.find(
    (record) => record.type === WAVLAKE_CUSTOM_KEY
  );

  const keysendMetadata: KeysendMetadata = jsonParser(metaDataRecord?.value);
  const maybeContentId = jsonParser(metaDataRecord?.value);

  // pull out the content id and any other data from the tlv records
  const contentId = "123-abc";

  // for testing in deployed service
  log.debug("request body", req.body);
  log.debug("keysendMetadata", keysendMetadata);
  log.debug("maybeContentId", maybeContentId);

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
  });
});

const processOutgoingKeysend = asyncHandler(async (req, res, next) => {
  // TODO - update an invoice
  // the invoice status is expected to change from pending to success or fail
  res.status(200);
});

const processIncomingInvoice = asyncHandler(async (req, res, next) => {
  // TODO - update an invoice
  // the invoice status is expected to change from pending to success or fail
  res.status(200);
});

const processOutgoingInvoice = asyncHandler(async (req, res, next) => {
  // TODO - update an invoice
  // the invoice status is expected to change from pending to success or fail
  res.status(200);
});

export default {
  processIncomingKeysend,
  processOutgoingKeysend,
  processIncomingInvoice,
  processOutgoingInvoice,
};
