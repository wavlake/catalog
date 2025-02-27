// nlInvoice is undefined when using import
const nlInvoice = require("@node-lightning/invoice");
import asyncHandler from "express-async-handler";
import core from "express-serve-static-core";
import log from "../../../library/winston";
import { validateNostrZapRequest } from "@library/zap";
import { ZapRequest } from "@library/nostr/common";
import prisma from "@prismalocal/client";
import { IncomingInvoiceType, PaymentType } from "@library/common";
import { logZapRequest } from "@library/invoice";
import crypto from "crypto";
import { createCharge, InvoiceBasic } from "@library/zbd";
import { TICKET_INVOICE_EXPIRATION_SECONDS } from "@library/constants";

const getTicketInvoice = asyncHandler<
  core.ParamsDictionary,
  {
    success: boolean;
    error?: string;
    data?: InvoiceBasic & { invoiceId: string };
  },
  any,
  ZapRequest
>(async (req, res, next) => {
  try {
    const { amount, nostr, metadata, lnurl } = req.query;
    const zapRequestString = decodeURIComponent(nostr);

    log.info(`Processing ticket payment with zap request: ${zapRequestString}`);

    const { isValid, error, zapRequestEvent } = validateNostrZapRequest({
      nostr: zapRequestString,
      amount,
      requireAOrETag: true,
    });

    if (!isValid) {
      res.status(400).send({ success: false, error });
      return;
    }

    const [eTag, eventId] = zapRequestEvent.tags.find((x) => x[0] === "e");

    if (!eventId) {
      res.status(400).send({
        success: false,
        error: "Zap request must reference a ticketed event using an e tag",
      });
      return;
    }

    const ticketedEvent = await prisma.ticketed_event.findUnique({
      where: { id: eventId },
    });

    if (!ticketedEvent) {
      res.status(400).send({
        success: false,
        error: "Event not found",
      });
      return;
    }

    const ticketCount = await prisma.ticket.count({
      where: { ticketed_event_id: ticketedEvent.id, is_paid: true },
    });
    const isSoldOut = ticketedEvent.total_tickets <= ticketCount;
    if (isSoldOut) {
      res.status(400).send({
        success: false,
        error: "Event is sold out",
      });
      return;
    }

    const pendingTickets = await prisma.ticket.findMany({
      where: { ticketed_event_id: ticketedEvent.id, is_pending: true },
    });

    const num_of_pending_tickets_allowed_at_once = 5;

    if (pendingTickets.length >= num_of_pending_tickets_allowed_at_once) {
      res.status(400).send({
        success: false,
        error:
          "Event demand is too high and may sell out soon, please try again in a few minutes.",
      });
      return;
    }

    // Create a blank invoice in the database
    const invoice = await prisma.externalReceive.create({
      data: {
        paymentTypeCode: PaymentType.Zap,
        isPending: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    log.info(`Created placeholder invoice: ${invoice.id}`);

    // Create zap request record
    await logZapRequest(
      invoice.id,
      zapRequestEvent.id,
      JSON.stringify(zapRequestEvent),
      IncomingInvoiceType.Ticket
    );

    const newTicket = await prisma.ticket.create({
      data: {
        ticketed_event_id: ticketedEvent.id,
        external_receive_id: invoice.id,
        is_used: false,
        is_paid: false,
        is_pending: true,
        created_at: new Date(),
        updated_at: new Date(),
        recipient_pubkey: zapRequestEvent.pubkey,
        nostr: zapRequestEvent as any,
      },
    });

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
      description: `Wavlake Ticket ID: ${newTicket.id}`,
      amount: amount,
      expiresIn: TICKET_INVOICE_EXPIRATION_SECONDS,
      internalId: `external_receive-${invoice.id.toString()}`,
      // can't have both description and invoiceDescriptionHash
      // invoiceDescriptionHash: descriptionHash,
    };

    log.info(
      `Creating ticket invoice request: ${JSON.stringify(invoiceRequest)}`
    );

    // call ZBD api to create an invoice
    const invoiceResponse = await createCharge(invoiceRequest);

    if (!invoiceResponse.success) {
      log.error(`Error creating ticket invoice: ${invoiceResponse.message}`);
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
          log.error(`Error updating ticket invoice: ${e}`);
          return null;
        });
      res
        .status(400)
        .send({ success: false, error: `${invoiceResponse.message}` });
      return;
    }

    log.info(
      `Received create ticket invoice response: ${JSON.stringify(
        invoiceResponse
      )}`
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
          trackId: `ticket-${newTicket.id}`,
        },
      })
      .catch((e) => {
        log.error(`Error updating ticket invoice: ${e}`);
        return null;
      });

    if (!updatedInvoice) {
      log.error(`Error updating invoice: ${invoiceResponse.message}`);
      res.status(500).send({
        success: false,
        error: "There has been an error generating a ticket invoice",
      });
      return;
    }

    log.info(`Updated ticket invoice: ${JSON.stringify(updatedInvoice)}`);

    res.send({
      success: true,
      data: { ...invoiceResponse.data.invoice, invoiceId: updatedInvoice.id },
    });
  } catch (e) {
    log.error(`Error generating ticket invoice: ${e}`);
    res
      .status(500)
      .json({ success: false, error: "Error generating ticket invoice" });
  }
});

export default { getTicketInvoice };

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
