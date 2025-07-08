// ramp-widget-controller.ts
import log from "../../../library/logger";
import asyncHandler from "express-async-handler";
import prisma from "@prismalocal/client";
import { createRampWidget } from "@library/zbd/zbdClient";
import { createApiErrorResponse } from "@library/errors";
import { randomUUID } from "crypto";
import { encryptSessionToken, decryptSessionToken } from "@library/encryption";

/**
 * Create a new ZBD Pay ramp widget session
 */
const createRampSession = asyncHandler(async (req, res: any, next) => {
  const userId = req["uid"];
  const request = {
    email: req.body.email,
    amount: req.body.amount,
    currency: req.body.currency,
    referenceId: req.body.referenceId,
  };

  // Validate request
  if (!request.email || typeof request.email !== "string") {
    return res
      .status(400)
      .json(createApiErrorResponse("Email is required", "INVALID_EMAIL"));
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(request.email)) {
    return res
      .status(400)
      .json(
        createApiErrorResponse("Invalid email format", "INVALID_EMAIL_FORMAT"),
      );
  }

  // Validate amount if provided
  if (request.amount && (isNaN(request.amount) || request.amount <= 0)) {
    return res
      .status(400)
      .json(
        createApiErrorResponse(
          "Amount must be a positive number",
          "INVALID_AMOUNT",
        ),
      );
  }

  let rampSession;
  try {
    // Generate unique session ID
    const sessionId = randomUUID();
    const referenceId = request.referenceId || `${userId}-${sessionId}`;

    // Create session record in database first
    rampSession = await prisma.rampWidgetSession.create({
      data: {
        id: sessionId,
        userId: userId,
        email: request.email,
        amount: request.amount,
        currency: request.currency || "USD",
        referenceId: referenceId,
        status: "pending",
        sessionToken: "", // Will be updated after ZBD call
        widgetUrl: "", // Will be updated after ZBD call
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
      },
    });

    log.info(`Created ramp widget session: ${sessionId} for user: ${userId}`);

    // Prepare ZBD Pay request
    const zbdRequest = {
      email: request.email,
      webhook_url: `${process.env.ACCOUNTING_CALLBACK_URL}/ramp-widget/callback`,
      quote_currency: request.currency || "USD",
      base_currency: "BTC",
      reference_id: referenceId,
      metadata: {
        userId: userId,
        sessionId: sessionId,
        amount: request.amount,
        currency: request.currency || "USD",
      },
    };

    log.info(
      `Sending create ramp widget request: ${JSON.stringify(zbdRequest)}`,
    );

    // Call ZBD Pay API to create ramp widget
    const zbdResponse = await createRampWidget(zbdRequest);

    if (!zbdResponse.success) {
      const errorMsg =
        (zbdResponse as any).error || zbdResponse.message || "Unknown error";
      log.error(`Error creating ramp widget: ${errorMsg}`);

      // Clean up the session record since the ZBD call failed
      await prisma.rampWidgetSession
        .delete({
          where: { id: sessionId },
        })
        .catch((e) => {
          log.error(`Failed to delete session ${sessionId}: ${e.message}`);
        });

      return res.status(500).json({
        success: false,
        error: errorMsg,
        message: "Failed to create ramp widget session",
      });
    }

    // Update session with ZBD response data
    const updatedSession = await prisma.rampWidgetSession.update({
      where: { id: sessionId },
      data: {
        sessionToken: encryptSessionToken(zbdResponse.data.session_token),
        widgetUrl: zbdResponse.data.widget_url,
        expiresAt: new Date(zbdResponse.data.expires_at),
      },
    });

    log.info(
      `Updated ramp widget session ${sessionId} with ZBD response: ${JSON.stringify(
        zbdResponse.data,
      )}`,
    );

    return res.status(200).json({
      success: true,
      data: {
        sessionId: sessionId,
        sessionToken: zbdResponse.data.session_token, // Return original token to client
        widgetUrl: zbdResponse.data.widget_url,
        expiresAt: zbdResponse.data.expires_at,
      },
    });
  } catch (error) {
    log.error(`Error in createRampSession: ${error.message}`);

    // Clean up session if it was created
    if (rampSession) {
      await prisma.rampWidgetSession
        .delete({
          where: { id: rampSession.id },
        })
        .catch((e) => {
          log.error(`Failed to delete session ${rampSession.id}: ${e.message}`);
        });
    }

    return res
      .status(500)
      .json(createApiErrorResponse("Internal server error", "INTERNAL_ERROR"));
  }
});

/**
 * Get ramp widget session status
 */
const getRampSession = asyncHandler(async (req, res: any, next) => {
  const userId = req["uid"];
  const sessionId = req.params.sessionId;

  if (!sessionId) {
    return res
      .status(400)
      .json(
        createApiErrorResponse("Session ID is required", "MISSING_SESSION_ID"),
      );
  }

  try {
    const session = await prisma.rampWidgetSession.findFirst({
      where: {
        id: sessionId,
        userId: userId, // Ensure user can only access their own sessions
      },
    });

    if (!session) {
      return res
        .status(404)
        .json(createApiErrorResponse("Session not found", "SESSION_NOT_FOUND"));
    }

    // Check if session is expired
    const isExpired = new Date() > session.expiresAt;
    const status = isExpired ? "expired" : session.status;

    // Update status to expired asynchronously if needed
    if (isExpired && session.status !== "expired") {
      prisma.rampWidgetSession
        .update({
          where: { id: sessionId },
          data: { status: "expired" },
        })
        .catch((error) => {
          log.error(
            `Failed to update session expiry status for ${sessionId}: ${error.message}`,
          );
        });
    }

    return res.status(200).json({
      success: true,
      data: {
        sessionId: session.id,
        status: status,
        widgetUrl: session.widgetUrl,
        expiresAt: session.expiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    log.error(`Error in getRampSession: ${error.message}`);
    return res
      .status(500)
      .json(createApiErrorResponse("Internal server error", "INTERNAL_ERROR"));
  }
});

/**
 * Handle ZBD Pay webhook callbacks
 */
const handleRampCallback = asyncHandler(async (req, res: any, next) => {
  const callbackData = req.body;

  log.info(`Received ZBD Pay ramp callback: ${JSON.stringify(callbackData)}`);

  try {
    // Extract session information from callback
    const referenceId = callbackData.reference_id;
    const status = callbackData.status; // 'completed', 'failed', etc.
    const metadata = callbackData.metadata || {};

    if (!referenceId) {
      log.error("Missing reference_id in ramp callback");
      return res.status(400).json({
        success: false,
        error: "Missing reference_id",
      });
    }

    // Find session by reference ID
    const session = await prisma.rampWidgetSession.findFirst({
      where: {
        referenceId: referenceId,
      },
    });

    if (!session) {
      log.error(`Ramp session not found for reference_id: ${referenceId}`);
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    // Update session status
    await prisma.rampWidgetSession.update({
      where: { id: session.id },
      data: {
        status: status,
        callbackData: callbackData,
        updatedAt: new Date(),
      },
    });

    log.info(`Updated ramp session ${session.id} status to ${status}`);

    // TODO: Add additional business logic here if needed
    // For example, notify user, update wallet balance, etc.

    return res.status(200).json({
      success: true,
      message: "Callback processed successfully",
    });
  } catch (error) {
    log.error(`Error processing ramp callback: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

export default {
  createRampSession,
  getRampSession,
  handleRampCallback,
};
