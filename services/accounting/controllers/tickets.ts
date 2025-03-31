import asyncHandler from "express-async-handler";
import core from "express-serve-static-core";
import log from "../../../library/winston";
import { validateNostrZapRequest } from "@library/zap";
import { ZapRequest } from "@library/nostr/common";
import prisma from "@prismalocal/client";
import crypto from "crypto";
import { createCharge } from "@library/zbd";
import { TICKET_INVOICE_EXPIRATION_SECONDS } from "@library/constants";
import { convertFiatToMsats } from "@library/bitcoinPrice";

const getTicketInvoice = asyncHandler<
  core.ParamsDictionary,
  {
    // Update return type to match LUD-06 spec
    pr?: string;
    routes?: any[];
    status?: string;
    reason?: string;
  },
  any,
  ZapRequest
>(async (req, res, next) => {
  try {
    const { nostr, metadata, amount } = req.query;
    const zapRequestString = decodeURIComponent(nostr);

    log.info(`Processing ticket payment with zap request: ${zapRequestString}`);

    // Since we're calculating the amount ourselves, pass null for amount validation
    // We'll validate the zap request first, then calculate the proper amount
    const { isValid, error, zapRequestEvent } = validateNostrZapRequest({
      nostr: zapRequestString,
      amount: amount,
      requireAOrETag: true,
    });

    if (!isValid) {
      log.info(`Invalid ticket zap request: ${error}`);
      // Update to LUD-06 error format
      res.status(400).json({ status: "ERROR", reason: error });
      return;
    }

    const [eTag, eventId] = zapRequestEvent.tags.find((x) => x[0] === "e");
    const DEFAULT_TICKET_COUNT = "1";
    const [countTag, ticketcount = DEFAULT_TICKET_COUNT] =
      zapRequestEvent.tags.find((x) => x[0] === "count");

    if (!eventId) {
      log.info("Invalid zap request: missing event id");
      // Update to LUD-06 error format
      res.status(400).json({
        status: "ERROR",
        reason: "Zap request must reference a ticketed event using an e tag",
      });
      return;
    }

    const ticketedEvent = await prisma.ticketed_event.findUnique({
      where: { id: eventId },
    });

    if (!ticketedEvent) {
      log.info(`Ticketed event not found for eventId: ${eventId}`);
      // Update to LUD-06 error format
      res.status(400).json({
        status: "ERROR",
        reason: "Event not found",
      });
      return;
    }

    const intCount = parseInt(ticketcount);

    // Calculate the price in msats based on the pricing information in the database
    let ticketPriceMsat: number;

    if (ticketedEvent.price_msat !== null) {
      // Direct msat pricing
      ticketPriceMsat = ticketedEvent.price_msat;
      log.info(
        `Using direct msat pricing: ${ticketPriceMsat} msats per ticket`
      );
    } else if (
      ticketedEvent.price_fiat !== null &&
      ticketedEvent.currency !== null
    ) {
      // Convert from fiat to msats
      try {
        ticketPriceMsat = await convertFiatToMsats(
          ticketedEvent.price_fiat,
          ticketedEvent.currency
        );
        log.info(
          `Converted fiat price ${ticketedEvent.price_fiat} ${ticketedEvent.currency} to ${ticketPriceMsat} msats`
        );
      } catch (e) {
        log.error(`Error converting fiat to msats: ${e}`);
        // Update to LUD-06 error format
        res.status(500).json({
          status: "ERROR",
          reason: "Error calculating ticket price from fiat currency",
        });
        return;
      }
    } else {
      // This shouldn't happen due to database constraints, but handle it anyway
      log.error(
        `Invalid pricing configuration for event ${eventId}. Neither price_msat nor price_fiat/currency are set.`
      );
      // Update to LUD-06 error format
      res.status(500).json({
        status: "ERROR",
        reason: "Event has invalid pricing configuration",
      });
      return;
    }

    // Calculate the total amount in msats
    const totalAmountMsats = intCount * ticketPriceMsat;

    // Convert msats to sats for the invoice
    const totalAmountSats = Math.ceil(totalAmountMsats / 1000);

    log.info(
      `Calculated total amount: ${totalAmountMsats} msats (${totalAmountSats} sats) for ${intCount} tickets`
    );

    const ticketCount = await prisma.ticket.count({
      where: { ticketedEventId: ticketedEvent.id, isPaid: true },
    });
    const isSoldOut = ticketedEvent.total_tickets <= ticketCount;
    if (isSoldOut) {
      log.info(`Event is sold out: ${ticketedEvent.id}`);
      // Update to LUD-06 error format
      res.status(400).json({
        status: "ERROR",
        reason: "Event is sold out",
      });
      return;
    }

    const pendingTickets = await prisma.ticket.count({
      where: { ticketedEventId: ticketedEvent.id, isPending: true },
    });
    log.info("Pending ticket count: ", pendingTickets);
    const num_of_pending_tickets_allowed_at_once = 5;

    if (pendingTickets >= num_of_pending_tickets_allowed_at_once) {
      log.info("Too many pending tickets");
      res.status(400).json({
        status: "ERROR",
        reason:
          "Event demand is too high and may sell out soon, please try again in a few minutes.",
      });
      return;
    }

    if (intCount > ticketedEvent.max_tickets_per_person) {
      log.info(
        `Ticket count exceeds max tickets per person: ${intCount} > ${ticketedEvent.max_tickets_per_person}`
      );
      res.status(400).json({
        status: "ERROR",
        reason: `Ticket count exceeds max tickets per person, max: ${ticketedEvent.max_tickets_per_person}`,
      });
      return;
    }

    const maxTicketsAvailable = ticketedEvent.total_tickets - ticketCount;
    if (intCount > maxTicketsAvailable) {
      log.info(
        `Ticket count exceeds total tickets: ${intCount} > ${maxTicketsAvailable}`
      );
      res.status(400).json({
        status: "ERROR",
        reason: `Ticket count exceeds total tickets. You may only purchase ${maxTicketsAvailable} tickets.`,
      });
      return;
    }

    const ticketsIssuedForPubkey = await prisma.ticket.count({
      where: {
        ticketedEventId: ticketedEvent.id,
        recipientPubkey: zapRequestEvent.pubkey,
        isPaid: true,
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
      res.status(400).json({
        status: "ERROR",
        reason: `Maximum number of tickets allowed per person: ${ticketedEvent.max_tickets_per_person}`,
      });
      return;
    }

    const newTicket = await prisma.ticket.create({
      data: {
        ticketedEventId: ticketedEvent.id,
        externalTransactionId: "",
        paymentRequest: "",
        isUsed: false,
        isPaid: false,
        isPending: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        recipientPubkey: zapRequestEvent.pubkey,
        nostr: zapRequestEvent as any,
        count: intCount,
        priceMsat: ticketPriceMsat,
      },
    });
    log.info(`Created new ticket, id: ${newTicket.id}`);
    const ticketId = newTicket.id;

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
      // invoice amount is in msats
      amount: totalAmountMsats.toString(),
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
      const errorMsg =
        (invoiceResponse as any).error ||
        invoiceResponse.message ||
        "Unknown error";
      log.error(`Error creating ticket invoice: ${invoiceResponse.message}`);
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          isPending: false,
          updatedAt: new Date(),
        },
      });

      res.status(400).json({
        status: "ERROR",
        reason: errorMsg,
      });
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
          paymentRequest: invoiceResponse.data.invoice.request,
          externalTransactionId: invoiceResponse.data.id,
          updatedAt: new Date(),
        },
      })
      .catch((e) => {
        log.error(`Error updating ticket invoice: ${e}`);
        return null;
      });

    if (!updatedTicket) {
      log.error(`Error updating ticket: ${invoiceResponse.message}`);
      res.status(500).json({
        status: "ERROR",
        reason: "There has been an error generating a ticket invoice",
      });
      return;
    }

    log.info(`Updated ticket invoice: ${JSON.stringify(updatedTicket)}`);

    // Update successful response to match LUD-06 spec format
    res.json({
      pr: invoiceResponse.data.invoice.request,
      routes: [], // An empty array as specified in the LUD-06 spec
    });
    return;
  } catch (e) {
    log.error(`Error generating ticket invoice: ${e}`);
    res.status(500).json({
      status: "ERROR",
      reason: "Error generating ticket invoice",
    });
    return;
  }
});

export default { getTicketInvoice };
