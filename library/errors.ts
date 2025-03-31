import log from "./winston";
import { ZBDErrorResponse } from "./zbd/responseInterfaces";

export const formatError = (status: number, message: string): Error => {
  const error = new Error(message);
  // @ts-ignore
  error.status = status;
  return error;
};

/**
 * Helper to extract readable message from ZBD API errors
 */
export function extractZbdErrorMessage(error: any): string {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.message) {
    return error.message;
  }

  return "Unknown ZBD API error";
}

/**
 * Helper to create standardized API error responses
 */
export function createApiErrorResponse(
  message: string,
  code?: string,
  details?: any
): ZBDErrorResponse & { error: string; details?: any } {
  return {
    success: false,
    message,
    error: message, // Adding error for our additional context
    details: process.env.NODE_ENV === "production" ? undefined : details,
  };
}

/**
 * Helper to log and format ZBD API errors
 */
export function handleZbdApiError(
  error: any,
  context: string
): ZBDErrorResponse & { error: string; details?: any } {
  const isAxiosError = error?.isAxiosError;
  const statusCode = error?.response?.status;
  const zbdMessage = extractZbdErrorMessage(error);

  // Log detailed error information
  log.error(`ZBD API error in ${context}: ${zbdMessage}`, {
    isAxiosError,
    statusCode,
    url: isAxiosError ? error.config?.url : undefined,
    method: isAxiosError ? error.config?.method : undefined,
    responseData: error?.response?.data,
    stack: error?.stack,
  });

  // Create user-friendly error message based on error type
  let userMessage = "Failed to process payment request";
  let errorCode = "ZBD_API_ERROR";

  if (statusCode === 401 || statusCode === 403) {
    userMessage = "Payment service authentication error";
    errorCode = "ZBD_AUTH_ERROR";
  } else if (statusCode === 429) {
    userMessage = "Payment service rate limit exceeded, please try again later";
    errorCode = "ZBD_RATE_LIMIT";
  } else if (statusCode === 400) {
    userMessage = `Invalid payment request: ${zbdMessage}`;
    errorCode = "ZBD_INVALID_REQUEST";
  } else if (statusCode >= 500) {
    userMessage =
      "Payment service is currently unavailable, please try again later";
    errorCode = "ZBD_SERVICE_UNAVAILABLE";
  }

  return createApiErrorResponse(userMessage, errorCode, {
    zbdMessage,
    statusCode,
  });
}
