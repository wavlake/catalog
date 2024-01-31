import log from "loglevel";
import asyncHandler from "express-async-handler";
import { validate } from "uuid";
import core from "express-serve-static-core";
import { ZBDKeysendCallbackRequest } from "@library/zbd/requestInterfaces";
import { buildAmpTx } from "@library/amp";
import db from "@library/db";
import { KeysendMetadata } from "@library/keysend";

const jsonParser = (jsonString?: string) => {
  if (!jsonString) return;
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    log.debug("Error parsing json", e);
    return;
  }
};

const BLIP0010 = "7629169";
const WAVLAKE_CUSTOM_KEY = "16180339";

const processIncomingKeysend = asyncHandler<
  core.ParamsDictionary,
  any,
  ZBDKeysendCallbackRequest
>(async (req, res, next) => {
  log.debug(`Keysend received`);

  const { transaction, keysendData } = req.body;

  const metaDataRecord = keysendData.tlvRecords.find(
    (record) => record.type === BLIP0010
  );
  const maybeContentIdRecord = keysendData.tlvRecords.find(
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

  const success = await buildAmpTx({
    // type: undefined,
    // settleIndex: null,
    // preimage: null,
    // rHashStr: null,
    // externalTxId: null,
    // boostData: metadata.boostData,
    userId: undefined,
    npub: undefined,
    res,
    trx,
    contentId,
    msatAmount: transaction.amount,
    contentTime: keysendMetadata.ts ? parseInt(keysendMetadata.ts) : undefined,
    comment: keysendData.description,
    isNostr: false,
    isNwc: false,
  });

  if (success) {
    log.debug("Amp tx built successfully");
  } else {
    log.error("Error building amp tx");
  }
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
