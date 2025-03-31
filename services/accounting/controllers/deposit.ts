// depositController.ts
import log from "../../../library/winston";
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import { getUserBalance } from "@library/userHelper";
import { createCharge } from "@library/zbd/zbdClient";
import {
  MAX_INVOICE_AMOUNT,
  DEFAULT_EXPIRATION_SECONDS,
} from "@library/constants";
import { validateNostrZapRequest } from "@library/zap";
import { logZapRequest } from "@library/invoice";
import { IncomingInvoiceType } from "@library/common";
import { createApiErrorResponse } from "@library/errors";

/**
 * Create a new deposit invoice
 */
const createDeposit = asyncHandler(async (req, res: any, next) => {
  const userId = req["uid"];
  const request = {
    msatAmount: req.body.msatAmount,
  };

  if (
    isNaN(request.msatAmount) ||
    request.msatAmount < 1000 ||
    request.msatAmount > MAX_INVOICE_AMOUNT
  ) {
    return res
      .status(400)
      .json(
        createApiErrorResponse(
          `Amount must be a number between 1000 and ${MAX_INVOICE_AMOUNT} (msats)`,
          "INVALID_AMOUNT"
        )
      );
  }

  let invoice;
  try {
    const userBalance = await getUserBalance(userId);

    // Create a blank invoice in the database to reference
    invoice = await prisma.transaction.create({
      data: {
        userId: userId,
        isPending: true,
        withdraw: false,
        msatAmount: request.msatAmount,
        preTxBalance: parseInt(userBalance),
        paymentRequest: "",
        isLnurl: false,
      },
    });

    log.info(`Created placeholder invoice: ${invoice.id}`);

    const invoiceRequest = {
      description: `Wavlake deposit`,
      amount: request.msatAmount.toString(),
      expiresIn: DEFAULT_EXPIRATION_SECONDS,
      internalId: `${IncomingInvoiceType.Transaction}-${invoice.id.toString()}`,
    };

    log.info(
      `Sending create invoice request for deposit: ${JSON.stringify(
        invoiceRequest
      )}`
    );

    // call ZBD api to create an invoice
    const invoiceResponse = await createCharge(invoiceRequest);

    if (!invoiceResponse.success) {
      // The ZBD API call failed
      // Using type assertion to access our extended properties
      const errorMsg =
        (invoiceResponse as any).error ||
        invoiceResponse.message ||
        "Unknown error";
      log.error(`Error creating invoice: ${errorMsg}`);

      // Clean up the placeholder invoice since the ZBD call failed
      await prisma.transaction
        .delete({
          where: { id: invoice.id },
        })
        .catch((e) => {
          log.error(
            `Failed to delete placeholder invoice ${invoice.id}: ${e.message}`
          );
        });

      return res.status(500).json(invoiceResponse);
    }

    log.info(
      `Received create invoice response: ${JSON.stringify(invoiceResponse)}`
    );

    // Update the invoice in the database
    const updatedInvoice = await prisma.transaction.update({
      where: { id: invoice.id },
      data: {
        paymentRequest: invoiceResponse.data.invoice.request,
        externalId: invoiceResponse.data.id,
        updatedAt: new Date(),
      },
    });

    log.info(`Updated invoice: ${JSON.stringify(updatedInvoice)}`);

    return res.json({
      success: true,
      data: { ...invoiceResponse.data.invoice, invoiceId: updatedInvoice.id },
    });
  } catch (e) {
    log.error(`Error in createDeposit: ${e.message}`, e);

    // If we created an invoice but then encountered an error, try to clean it up
    if (invoice?.id) {
      await prisma.transaction
        .delete({
          where: { id: invoice.id },
        })
        .catch((deleteErr) => {
          log.error(
            `Failed to delete invoice ${invoice.id} during error recovery: ${deleteErr.message}`
          );
        });
    }

    return res
      .status(500)
      .json(
        createApiErrorResponse(
          "An error occurred while processing your request",
          "SERVER_ERROR",
          { message: e.message }
        )
      );
  }
});

/**
 * Create a new LNURL deposit invoice
 */
const createDepositLNURL = asyncHandler(async (req, res: any, next) => {
  const userId = req.body.userId as string;
  const amount = req.body.amount as string;
  const nostr = req.body.nostr as string;
  const metadata = req.body.metadata as string;
  const lnurl = req.body.lnurl as string;
  const comment = req.body.comment as string;
  const amountInt = parseInt(amount);

  if (isNaN(amountInt) || amountInt < 1000 || amountInt > MAX_INVOICE_AMOUNT) {
    log.info(
      `Invalid amount, must be between 1000 and ${MAX_INVOICE_AMOUNT} sats, received ${amount}`
    );
    return res
      .status(400)
      .json(
        createApiErrorResponse(
          `Amount must be a number between 1000 and ${MAX_INVOICE_AMOUNT} (msats)`,
          "INVALID_AMOUNT"
        )
      );
  }

  let zapRequestEvent;
  if (nostr) {
    const validationResult = validateNostrZapRequest({ nostr, amount });
    if (!validationResult.isValid) {
      log.info(`LNURL zap request is invalid: ${validationResult.error}`);
      return res
        .status(400)
        .json(
          createApiErrorResponse(
            validationResult.error || "Invalid zap request",
            "INVALID_ZAP_REQUEST"
          )
        );
    }
    zapRequestEvent = validationResult.zapRequestEvent;
  }

  let invoice;
  try {
    const userBalance = await getUserBalance(userId);

    // Create a blank invoice in the database to reference
    invoice = await prisma.transaction.create({
      data: {
        userId: userId,
        isPending: true,
        withdraw: false,
        msatAmount: amountInt,
        preTxBalance: parseInt(userBalance),
        paymentRequest: "",
        isLnurl: true,
        lnurlComment: comment || undefined,
      },
    });

    log.info(`Created placeholder LNURL invoice: ${invoice.id}`);

    if (zapRequestEvent) {
      // Create zap request record
      await logZapRequest(
        invoice.id,
        zapRequestEvent.id,
        JSON.stringify(zapRequestEvent),
        IncomingInvoiceType.LNURL_Zap
      );
    }

    const invoiceRequest = {
      description: `Wavlake LNURL${zapRequestEvent ? "-zap" : ""} deposit`,
      amount: amountInt.toString(),
      expiresIn: DEFAULT_EXPIRATION_SECONDS,
      internalId: `${
        zapRequestEvent
          ? IncomingInvoiceType.LNURL_Zap
          : IncomingInvoiceType.LNURL
      }-${invoice.id.toString()}`,
    };

    log.info(
      `Sending create invoice request for LNURL deposit: ${JSON.stringify(
        invoiceRequest
      )}`
    );

    // Call ZBD API to create an invoice
    const invoiceResponse = await createCharge(invoiceRequest);

    if (!invoiceResponse.success) {
      // Using type assertion to access our extended properties
      const errorMsg =
        (invoiceResponse as any).error ||
        invoiceResponse.message ||
        "Unknown error";
      log.error(`Error creating LNURL invoice: ${errorMsg}`);

      // Clean up the placeholder invoice since the ZBD call failed
      await prisma.transaction
        .delete({
          where: { id: invoice.id },
        })
        .catch((e) => {
          log.error(
            `Failed to delete placeholder LNURL invoice ${invoice.id}: ${e.message}`
          );
        });

      return res.status(500).json(invoiceResponse);
    }

    log.info(
      `Received create LNURL invoice response: ${JSON.stringify(
        invoiceResponse
      )}`
    );

    // Update the invoice in the database
    const updatedInvoice = await prisma.transaction.update({
      where: { id: invoice.id },
      data: {
        paymentRequest: invoiceResponse.data.invoice.request,
        externalId: invoiceResponse.data.id,
        updatedAt: new Date(),
      },
    });

    log.info(`Updated LNURL invoice: ${JSON.stringify(updatedInvoice)}`);

    return res.json({
      success: true,
      data: { ...invoiceResponse.data.invoice, invoiceId: updatedInvoice.id },
    });
  } catch (e) {
    log.error(`Error in createDepositLNURL: ${e.message}`, e);

    // If we created an invoice but then encountered an error, try to clean it up
    if (invoice?.id) {
      await prisma.transaction
        .delete({
          where: { id: invoice.id },
        })
        .catch((deleteErr) => {
          log.error(
            `Failed to delete LNURL invoice ${invoice.id} during error recovery: ${deleteErr.message}`
          );
        });
    }

    return res
      .status(500)
      .json(
        createApiErrorResponse(
          "An error occurred while processing your request",
          "SERVER_ERROR",
          { message: e.message }
        )
      );
  }
});

/**
 * Get deposit invoice details
 */
const getDeposit = asyncHandler(async (req, res: any, next) => {
  const userId = req["uid"];
  const { id } = req.params;

  const invoiceId = parseInt(id);
  if (!id || isNaN(invoiceId)) {
    return res
      .status(400)
      .json(
        createApiErrorResponse(
          "Invoice ID is required and must be a number",
          "INVALID_ID"
        )
      );
  }

  try {
    const invoice = await prisma.transaction.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return res
        .status(404)
        .json(createApiErrorResponse("Invoice not found", "NOT_FOUND"));
    }

    if (invoice.userId !== userId) {
      return res
        .status(403)
        .json(
          createApiErrorResponse(
            "You do not have permission to access this invoice",
            "FORBIDDEN"
          )
        );
    }

    return res.json({ success: true, data: { invoice } });
  } catch (e) {
    log.error(`Error in getDeposit: ${e.message}`, e);
    return res
      .status(500)
      .json(
        createApiErrorResponse(
          "An error occurred while retrieving the invoice",
          "SERVER_ERROR",
          { message: e.message }
        )
      );
  }
});

export default { createDeposit, getDeposit, createDepositLNURL };
