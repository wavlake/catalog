const log = require("loglevel");
log.setLevel(process.env.LOG_LEVEL || "info");
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import { logZapRequest } from "@library/invoice";
import { getContentFromId } from "@library/content";
import { createCharge } from "@library/zbd/zbdClient";
import {
  MAX_INVOICE_AMOUNT,
  DEFAULT_EXPIRATION_SECONDS,
} from "@library/constants";
const nlInvoice = require("@node-lightning/invoice");
import core from "express-serve-static-core";
const { verifyEvent } = require("nostr-tools");
import { getContentFromEventId } from "@library/content";
const crypto = require("crypto");

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

const createInvoice = asyncHandler(async (req, res: any, next) => {
  const request = {
    contentId: req.body.contentId,
    msatAmount: req.body.msatAmount,
    metadata: req.body.metadata,
    type: req.body.type,
    timestamp: req.body.timestamp ?? null,
  };

  if (
    isNaN(request.msatAmount) ||
    request.msatAmount < 1000 ||
    request.msatAmount > MAX_INVOICE_AMOUNT
  ) {
    return res
      .status(400)
      .send(
        `Amount must be a number between 1000 and ${MAX_INVOICE_AMOUNT} (msats)`
      );
  }

  const isValidContentId = await getContentFromId(request.contentId);

  if (!isValidContentId) {
    return res.status(400).send("Invalid content id");
  }

  // Only two types possible right now: party or plain invoice
  const paymentTypeCode = request.type === "party" ? 8 : 6;

  // Create a blank invoice in the database with a reference to the targeted content
  const invoice = await prisma.externalReceive.create({
    data: {
      trackId: request.contentId,
      isPending: true,
      paymentTypeCode: paymentTypeCode,
    },
  });

  log.debug(`Created placeholder invoice: ${invoice.id}`);

  const invoiceRequest = {
    description: `Wavlake: ${isValidContentId.title}`,
    amount: request.msatAmount.toString(),
    expiresIn: DEFAULT_EXPIRATION_SECONDS,
    internalId: `external_receive-${invoice.id.toString()}`,
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

  const paymentHash = getPaymentHash(invoiceResponse.data.invoice.request);

  // Update the invoice in the database
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
    res.status(500).send("There has been an error generating an invoice");
    return;
  }

  log.debug(`Updated invoice: ${JSON.stringify(updatedInvoice)}`);

  res.json({
    success: true,
    data: { ...invoiceResponse.data.invoice, invoiceId: updatedInvoice.id },
  });
});

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
    res
      .status(400)
      .send(
        `Amount must be a number between 1000 and ${MAX_INVOICE_AMOUNT} (msats)`
      );
    return;
  }

  console.log(`Zap request: ${JSON.stringify(nostr)}`);
  // Validate nostr object
  let zapRequestEvent;
  try {
    zapRequestEvent = JSON.parse(nostr);
  } catch (e) {
    res.status(400).send({ success: false, error: "Invalid nostr object" });
    return;
  }
  let eventIsOK = verifyEvent(zapRequestEvent);
  if (!eventIsOK) {
    res
      .status(400)
      .send({ success: false, error: "Invalid zap request event" });
    return;
  }

  // https://github.com/nostr-protocol/nips/blob/master/57.md#appendix-a-zap-request-event
  const eTag = zapRequestEvent.tags.find((x) => x[0] === "e");
  const aTag = zapRequestEvent.tags.find((x) => x[0] === "a");

  // one of these is needed to determine the track ID
  if (!aTag && !eTag) {
    res.status(400).send({
      success: false,
      error: "Event must include either an a tag or an e tag.",
    });
    return;
  }

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

  // log.debug(`Zapped content: ${JSON.stringify(zappedContent)}`);
  if (!zappedContent) {
    res
      .status(404)
      .send({ success: false, error: `Content id for zap could not be found` });
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
  await logZapRequest(invoice.id, zapRequestEvent.id, zapRequestEvent);

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
    res.status(500).send("There has been an error generating an invoice");
    return;
  }

  log.debug(`Updated invoice: ${JSON.stringify(updatedInvoice)}`);

  res.send({
    success: true,
    data: { ...invoiceResponse.data.invoice, invoiceId: updatedInvoice.id },
  });
});

export default { createInvoice, createZapInvoice };
