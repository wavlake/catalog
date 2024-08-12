import log, { LogLevelDesc } from "loglevel";
log.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || "info");
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import { logZapRequest } from "@library/invoice";
import { getContentFromId } from "@library/content";
import { createCharge } from "@library/zbd/zbdClient";
import {
  MAX_INVOICE_AMOUNT,
  DEFAULT_EXPIRATION_SECONDS,
} from "@library/constants";
import nlInvoice from "@node-lightning/invoice";
import core from "express-serve-static-core";
import { getContentFromEventId } from "@library/content";
import crypto from "crypto";
import { validateNostrZapRequest } from "@library/zap";

const getPaymentHash = (invoice: string) => {
  let decodedInvoice;
  try {
    decodedInvoice = nlInvoice.decode(invoice);
  } catch (err) {
    log.error(`Error decoding invoice ${err}`);
    return;
  }
  const { paymentHash } = decodedInvoice;

  return Buffer.from(paymentHash).toString("hex");
};

interface ZapRequest {
  amount: string;
  nostr: string;
  metadata: string;
  lnurl: string;
}

const createZapInvoice = asyncHandler<
  core.ParamsDictionary,
  any,
  any,
  ZapRequest
>(async (req, res, next) => {
  const { amount, nostr, metadata, lnurl } = req.query;

  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt < 1000 || amountInt > MAX_INVOICE_AMOUNT) {
    res.status(400).send({
      success: false,
      error: `Amount must be a number between 1000 and ${MAX_INVOICE_AMOUNT} (msats)`,
    });
    return;
  }

  log.debug(`Zap request: ${JSON.stringify(nostr)}`);
  const validationResult = validateNostrZapRequest({
    nostr,
    amount,
    requireAOrETag: true,
  });

  if (!validationResult.isValid) {
    res.status(400).send({ success: false, error: validationResult.error });
    return;
  }

  const zapRequestEvent = validationResult.zapRequestEvent;

  const eTag = zapRequestEvent.tags.find((x) => x[0] === "e");
  const aTag = zapRequestEvent.tags.find((x) => x[0] === "a");

  let zappedContent = null;

  if (eTag) {
    const [e, eventId] = eTag;
    zappedContent = await getContentFromEventId(eventId);
  }

  if (aTag) {
    const [a, nip33EventCoordinate] = aTag;
    const [kind, pubkey, contentId] = nip33EventCoordinate.split(":");
    zappedContent = await getContentFromId(contentId);
  }

  if (!zappedContent) {
    res
      .status(404)
      .send({ success: false, error: `Content id for zap could not be found` });
    return;
  }

  // Amount check
  const [amountTag, amountTagValue] =
    zapRequestEvent.tags.find((x) => x[0] === "amount") ?? [];

  if (!amountTagValue || parseInt(amount) !== parseInt(amountTagValue)) {
    res.status(400).send({
      success: false,
      error: `Amount in zap request event is missing or does not match invoice amount`,
    });
    return;
  }

  // Create a blank invoice in the database with a reference to the targeted content
  const invoice = await prisma.externalReceive.create({
    data: {
      trackId: zappedContent.id,
      paymentTypeCode: 7, // Zap code
      isPending: true,
    },
  });

  log.debug(`Created placeholder invoice: ${invoice.id}`);

  // Create zap request record
  await logZapRequest(
    invoice.id,
    zapRequestEvent.id,
    JSON.stringify(zapRequestEvent)
  );

  const hash = crypto.createHash("sha256");

  let descriptionHash;
  if (metadata) {
    // metadata for lnurl verification
    descriptionHash = metadata;
  } else {
    // hash the zap request for nostr
    descriptionHash = hash.update(nostr).digest("hex");
  }

  const invoiceRequest = {
    // description: `Wavlake Zap: ${zappedContent.title}`, // Removed for now
    amount: amount,
    expiresIn: DEFAULT_EXPIRATION_SECONDS,
    internalId: `external_receive-${invoice.id.toString()}`,
    invoiceDescriptionHash: descriptionHash,
  };

  log.debug(
    `Sending create invoice request: ${JSON.stringify(invoiceRequest)}`
  );

  // call ZBD api to create an invoice
  const invoiceResponse = await createCharge(invoiceRequest);

  if (!invoiceResponse.success) {
    log.error(`Error creating invoice: ${invoiceResponse.message}`);
    await prisma.externalReceive
      .update({
        where: { id: invoice.id },
        data: {
          isPending: false,
          errorMessage: invoiceResponse.message,
          updatedAt: new Date(),
        },
      })
      .catch((e) => {
        log.error(`Error updating invoice: ${e}`);
        return null;
      });
    res
      .status(400)
      .send({ success: false, error: `${invoiceResponse.message}` });
    return;
  }

  log.debug(
    `Received create invoice response: ${JSON.stringify(invoiceResponse)}`
  );

  // Update the invoice in the database
  const paymentHash = getPaymentHash(invoiceResponse.data.invoice.request);

  const updatedInvoice = await prisma.externalReceive
    .update({
      where: { id: invoice.id },
      data: {
        paymentHash: paymentHash,
        externalId: invoiceResponse.data.id,
        updatedAt: new Date(),
      },
    })
    .catch((e) => {
      log.error(`Error updating invoice: ${e}`);
      return null;
    });

  if (!updatedInvoice) {
    log.error(`Error updating invoice: ${invoiceResponse.message}`);
    res.status(500).send({
      success: false,
      error: "There has been an error generating an invoice",
    });
    return;
  }

  log.debug(`Updated invoice: ${JSON.stringify(updatedInvoice)}`);

  res.send({
    success: true,
    data: { ...invoiceResponse.data.invoice, invoiceId: updatedInvoice.id },
  });
});

export default { createZapInvoice };
