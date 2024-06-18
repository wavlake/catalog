import log from "loglevel";
import asyncHandler from "express-async-handler";
import { validate } from "uuid";
import core from "express-serve-static-core";
import {
  ZBDKeysendCallbackRequest,
  ZBDSendKeysendCallbackRequest,
  ZBDChargeCallbackRequest,
  ZBDPaymentCallbackRequest,
} from "@library/zbd/requestInterfaces";
import { KeysendMetadata } from "@library/keysend";
import { processSplits } from "@library/amp";
import { updateKeysend } from "@library/keysends";
import { updateInvoiceIfNeeded } from "@library/invoice";
import {
  handleCompletedForward,
  handleCompletedWithdrawal,
} from "@library/withdraw";

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

  const { invoice, transaction } = req.body;

  const metaDataRecord = invoice.tlvRecords.find(
    (record) => record.type === BLIP0010
  );
  const contentIdRecord = invoice.tlvRecords.find(
    (record) => record.type === WAVLAKE_CUSTOM_KEY
  );

  const keysendMetadata: KeysendMetadata = metaDataRecord?.value
    ? jsonParser(Buffer.from(metaDataRecord.value, "hex").toString())
    : undefined;

  // expected to be hex string that needs to be decoded
  // convert hex value to string
  const contentId = contentIdRecord?.value
    ? Buffer.from(contentIdRecord.value, "hex").toString()
    : undefined;

  // for testing in deployed service
  log.debug("request body", req.body);
  log.debug("keysendMetadata", keysendMetadata);
  log.debug("contentId", contentId);

  if (!contentId || !validate(contentId)) {
    log.error("Did not find a valid content id in the tlv records");
    res.status(400).send({
      success: false,
      error: "Invalid content id",
    });
    return;
  }

  const success = await processSplits({
    contentId,
    contentTime: keysendMetadata?.ts ? parseInt(keysendMetadata.ts) : undefined,
    msatAmount: transaction.amount,
    userId: undefined,
    externalTxId: undefined,
    // type 5 is keysend
    paymentType: 5,
    boostData: keysendMetadata,
    comment: keysendMetadata?.message ? keysendMetadata.message : undefined,
    isNostr: false,
  });

  if (success) {
    log.debug("Amp tx built successfully");
    res.status(200).send({
      success: true,
    });
  } else {
    log.error("Error building amp tx");
    res.status(500).send({
      success: false,
      error: "Error processing keysend",
    });
  }
});

const processOutgoingKeysend = asyncHandler<
  core.ParamsDictionary,
  any,
  ZBDSendKeysendCallbackRequest
>(async (req, res, next) => {
  const { metadata, status, fee } = req.body;
  const internalTxId = metadata.internalTxId;
  log.debug(
    `Processing outgoing keysend callback internalTxId: ${internalTxId}`
  );

  if (!internalTxId || !status) {
    log.error("Missing externalId or status");
    res.status(400).send({
      success: false,
      error: "Must include id and status in the body's transaction object",
    });
    return;
  }

  // Sleep for 500 ms to allow the db to update before callback is logged
  await new Promise((resolve) => setTimeout(resolve, 500));
  await updateKeysend({
    internalTxId,
    status,
    fee,
  })
    .then(() => {
      log.debug(`Updated keysend ${internalTxId} with status ${status}`);
      res.status(200).send({ success: true });
    })
    .catch((e) => {
      log.error(`Error updating keysend: ${e}`);
      res.status(500).send({
        success: false,
        error: "Error updating keysend",
      });
    });
});

const processIncomingInvoice = asyncHandler<
  core.ParamsDictionary,
  any,
  ZBDChargeCallbackRequest
>(async (req, res, next) => {
  log.debug(`Incoming invoice received`);
  // the invoice status is expected to change from pending to success or fail
  const { internalId } = req.body;

  const [invoiceType, invoiceId] = internalId.split("-");
  const { success, message } = await updateInvoiceIfNeeded(
    invoiceType,
    parseInt(invoiceId),
    req.body
  );

  if (!success) {
    res.status(500).send({
      success: false,
      error: `Error updating invoice ${message}`,
    });
    return;
  }

  res.status(200).send({ success: true });
  return;
});

const processOutgoingInvoice = asyncHandler<
  core.ParamsDictionary,
  any,
  ZBDPaymentCallbackRequest
>(async (req, res, next) => {
  log.debug(`Received outgoing invoice callback: ${JSON.stringify(req.body)}`);

  const { id, status, internalId, fee, preimage, amount } = req.body;

  const validInvoiceTypes = ["transaction", "forward"];

  const [invoiceType, internalIdString] = internalId.split("-");
  if (!validInvoiceTypes.includes(invoiceType)) {
    log.error(`Invalid internalId type: ${invoiceType}`);
    res.status(400).send({
      success: false,
      error: `Expected internalId to be of type: ${validInvoiceTypes}`,
    });
    return;
  }

  if (invoiceType === "forward") {
    const isSuccess = await handleCompletedForward({
      externalPaymentId: id,
      status,
      msatAmount: parseInt(amount),
      fee: parseInt(fee),
      preimage,
    });

    if (!isSuccess) {
      log.error(`Error updating forward ${internalId} with status ${status}`);
      res.status(500).send({
        success: false,
        error: "Forward update failed",
      });
      return;
    }

    res.status(200).send({ success: true });
    return;
  }

  if (invoiceType === "transaction") {
    const intId = parseInt(internalIdString);
    const isSuccess = await handleCompletedWithdrawal({
      transactionId: intId,
      status,
      fee: parseInt(fee),
      preimage,
      msatAmount: parseInt(amount),
    });

    if (!isSuccess) {
      log.error(`Error updating invoice id ${intId} with status ${status}`);
      res.status(500).send({
        success: false,
        error: "Withdrawal update failed",
      });
      return;
    }
    res.status(200).send({ succes: true });
    return;
  }

  res.status(200).send({ succes: true });
});

export default {
  processIncomingKeysend,
  processOutgoingKeysend,
  processIncomingInvoice,
  processOutgoingInvoice,
};
