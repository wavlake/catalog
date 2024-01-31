import log from "loglevel";
import asyncHandler from "express-async-handler";
import { validate } from "uuid";
import core from "express-serve-static-core";
import { ZBDKeysendCallbackRequest } from "@library/zbd/requestInterfaces";
import db from "@library/db";
import { KeysendMetadata } from "@library/keysend";
import { processSplits } from "@library/amp2";

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

  const success = await processSplits({
    contentId,
    contentTime: keysendMetadata.ts ? parseInt(keysendMetadata.ts) : undefined,
    msatAmount: transaction.amount,
    userId: undefined,
    externalTxId: undefined,
    // type 5 is keysend
    paymentType: 5,
    boostData: undefined,
    isNostr: false,
  });

  if (success) {
    log.debug("Amp tx built successfully");
    res.status(200);
  } else {
    log.error("Error building amp tx");
    res.status(500).send("Error processing keysend");
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
