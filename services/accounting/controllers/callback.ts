import log from "loglevel";
import asyncHandler from "express-async-handler";
import { validate } from "uuid";
import core from "express-serve-static-core";
import { ZBDKeysendCallbackRequest } from "@library/zbd/requestInterfaces";
import { KeysendMetadata } from "@library/keysend";
import { processSplits } from "@library/amp";

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
  const contentIdRecord = keysendData.tlvRecords.find(
    (record) => record.type === WAVLAKE_CUSTOM_KEY
  );

  const keysendMetadata: KeysendMetadata = jsonParser(metaDataRecord?.value);

  // expected to be hex string that needs to be decoded
  const contentId = Buffer.from(contentIdRecord?.value).toString("hex");

  // for testing in deployed service
  log.debug("request body", req.body);
  log.debug("keysendMetadata", keysendMetadata);
  log.debug("contentId", contentId);

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
  log.debug("Incoming invoice", req.body);
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
