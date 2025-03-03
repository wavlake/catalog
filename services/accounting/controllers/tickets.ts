// nlInvoice is undefined when using import
const nlInvoice = require("@node-lightning/invoice");
import asyncHandler from "express-async-handler";
import core from "express-serve-static-core";
import log from "../../../library/winston";
import { validateNostrZapRequest } from "@library/zap";
import { ZapRequest } from "@library/nostr/common";
import prisma from "@prismalocal/client";
import { IncomingInvoiceType } from "@library/common";
import { logZapRequest } from "@library/invoice";
import crypto from "crypto";
import { createCharge, InvoiceBasic } from "@library/zbd";
import { TICKET_INVOICE_EXPIRATION_SECONDS } from "@library/constants";

const getTicketInvoice = asyncHandler<
  core.ParamsDictionary,
  {
    success: boolean;
    error?: string;
    data?: InvoiceBasic;
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
      log.info(`Invalid ticket zap request: ${error}`);
      res.status(400).send({ success: false, error });
      return;
    }

    const [eTag, eventId] = zapRequestEvent.tags.find((x) => x[0] === "e");
    const DEFAULT_TICKET_COUNT = "1";
    const [countTag, ticketcount = DEFAULT_TICKET_COUNT] =
      zapRequestEvent.tags.find((x) => x[0] === "count");

    if (!eventId) {
      log.info("Invalid zap request: missing event id");
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
      log.info(`Ticketed event not found for eventId: ${eventId}`);
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
      log.info(`Event is sold out: ${ticketedEvent.id}`);
      res.status(400).send({
        success: false,
        error: "Event is sold out",
      });
      return;
    }

    const pendingTickets = await prisma.ticket.count({
      where: { ticketed_event_id: ticketedEvent.id, is_pending: true },
    });
    log.info("Pending ticket count: ", pendingTickets);
    const num_of_pending_tickets_allowed_at_once = 5;

    if (pendingTickets >= num_of_pending_tickets_allowed_at_once) {
      log.info("Too many pending tickets");
      res.status(400).send({
        success: false,
        error:
          "Event demand is too high and may sell out soon, please try again in a few minutes.",
      });
      return;
    }

    const intCount = parseInt(ticketcount);
    if (intCount > ticketedEvent.max_tickets_per_person) {
      log.info(
        `Ticket count exceeds max tickets per person: ${intCount} > ${ticketedEvent.max_tickets_per_person}`
      );
      res.status(400).send({
        success: false,
        error: `Ticket count exceeds max tickets per person, max: ${ticketedEvent.max_tickets_per_person}`,
      });
      return;
    }

    const maxTicketsAvailable = ticketedEvent.total_tickets - ticketCount;
    if (intCount > maxTicketsAvailable) {
      log.info(
        `Ticket count exceeds total tickets: ${intCount} > ${maxTicketsAvailable}`
      );
      res.status(400).send({
        success: false,
        error: `Ticket count exceeds total tickets. You may only purchase ${maxTicketsAvailable} tickets.`,
      });
      return;
    }

    const ticketsIssuedForPubkey = await prisma.ticket.count({
      where: {
        ticketed_event_id: ticketedEvent.id,
        recipient_pubkey: zapRequestEvent.pubkey,
        is_paid: true,
      },
    });
    log.info(`Tickets issued for pubkey: ${ticketsIssuedForPubkey}`);

    if (
      ticketsIssuedForPubkey + intCount >
      ticketedEvent.max_tickets_per_person
    ) {
      log.info(
        `User has already purchased ${ticketsIssuedForPubkey} tickets. Purchasing ${intCount} additional tickets would be greater than the max of ${ticketedEvent.max_tickets_per_person}`
      );
      res.status(400).send({
        success: false,
        error: `Maximum number of tickets allowed per person: ${ticketedEvent.max_tickets_per_person}`,
      });
      return;
    }

    const newTicket = await prisma.ticket.create({
      data: {
        ticketed_event_id: ticketedEvent.id,
        external_transaction_id: "",
        payment_request: "",
        is_used: false,
        is_paid: false,
        is_pending: true,
        created_at: new Date(),
        updated_at: new Date(),
        recipient_pubkey: zapRequestEvent.pubkey,
        nostr: zapRequestEvent as any,
        count: intCount,
      },
    });
    log.info(`Created new ticket, id: ${newTicket.id}`);
    const ticketId = newTicket.id;
    // Create zap request record
    await logZapRequest(
      ticketId,
      zapRequestEvent.id,
      JSON.stringify(zapRequestEvent),
      IncomingInvoiceType.Ticket
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
      // description: `Wavlake Ticket ID: ${newTicket.id}`,
      amount: amount,
      expiresIn: TICKET_INVOICE_EXPIRATION_SECONDS,
      internalId: `ticket-${ticketId}`,
      // can't have both description and invoiceDescriptionHash
      invoiceDescriptionHash: descriptionHash,
    };

    log.info(
      `Creating ticket invoice request: ${JSON.stringify(invoiceRequest)}`
    );

    // call ZBD api to create an invoice
    const invoiceResponse = await createCharge(invoiceRequest);

    if (!invoiceResponse.success) {
      log.error(`Error creating ticket invoice: ${invoiceResponse.message}`);
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          is_pending: false,
          updated_at: new Date(),
        },
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

    const updatedTicket = await prisma.ticket
      .update({
        where: { id: newTicket.id },
        data: {
          payment_request: invoiceResponse.data.invoice.request,
          external_transaction_id: invoiceResponse.data.id,
          updated_at: new Date(),
        },
      })
      .catch((e) => {
        log.error(`Error updating ticket invoice: ${e}`);
        return null;
      });

    if (!updatedTicket) {
      log.error(`Error updating ticket: ${invoiceResponse.message}`);
      res.status(500).send({
        success: false,
        error: "There has been an error generating a ticket invoice",
      });
      return;
    }

    log.info(`Updated ticket invoice: ${JSON.stringify(updatedTicket)}`);

    res.send({
      success: true,
      data: { ...invoiceResponse.data.invoice },
    });
  } catch (e) {
    log.error(`Error generating ticket invoice: ${e}`);
    res
      .status(500)
      .json({ success: false, error: "Error generating ticket invoice" });
  }
});

export default { getTicketInvoice };
