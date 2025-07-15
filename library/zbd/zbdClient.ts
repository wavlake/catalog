// zbdClient.ts
import {
  CreateInvoiceRequest,
  SendKeysendRequest,
  SendPaymentRequest,
  LightningAddressPaymentRequest,
  CreateRampWidgetRequest,
} from "./requestInterfaces";
import log from "../logger";
import {
  ZBDGetChargeResponse,
  ZBDCreateChargeLightningResponse,
  ZBDIsSupportedRegionResponse,
  ZBDSendKeysendPaymentResponse,
  ZBDSendPaymentResponse,
  ZBDErrorResponse,
  ZBDRampWidgetResponse,
} from "./responseInterfaces";
import axios from "axios";
import { handleZbdApiError } from "../errors";

// Create ZBD instance
const zbdApiKey = process.env.ZBD_API_KEY;
const accountingCallbackUrl = `${process.env.ACCOUNTING_CALLBACK_URL}`;

const client = axios.create({
  baseURL: "https://api.zebedee.io/v0",
  headers: { apikey: zbdApiKey },
  timeout: 30000, // Increased timeout for payment processing
});

// Create separate client for ramp widget (uses v1 API)
const rampClient = axios.create({
  baseURL: "https://api.zebedee.io/v1",
  headers: { apikey: zbdApiKey },
  timeout: 30000, // Longer timeout for widget creation
});

export async function getPaymentStatus(
  paymentId: string,
): Promise<ZBDSendPaymentResponse> {
  try {
    const res = await client.get(`/payments/${paymentId}`);
    return res.data;
  } catch (err) {
    return handleZbdApiError(err, `getPaymentStatus(${paymentId})`);
  }
}

export async function getProductionIps(): Promise<
  string[] | (ZBDErrorResponse & { error: string })
> {
  try {
    const { data } = await client.get("/prod-ips");
    return data.data.ips;
  } catch (err) {
    return handleZbdApiError(err, "getProductionIps()");
  }
}

export async function isSupportedRegion(ipAddress: string): Promise<boolean> {
  try {
    const res = await client.get<ZBDIsSupportedRegionResponse>(
      `/is-supported-region/${ipAddress}`,
    );

    // Check if response is successful and has expected format
    if (res.data.success && "isSupported" in res.data.data) {
      log.info(`ZBD is-supported-region response: ${JSON.stringify(res.data)}`);
      return res.data.data.isSupported;
    }

    log.warn(
      `Unexpected response format from is-supported-region: ${JSON.stringify(
        res.data,
      )}`,
    );
    return false;
  } catch (err) {
    log.error(`Error checking region support for IP ${ipAddress}:`, err);
    return false;
  }
}

export async function sendKeysend(
  request: SendKeysendRequest,
): Promise<ZBDSendKeysendPaymentResponse> {
  try {
    const res = await client.post<ZBDSendKeysendPaymentResponse>(
      `/keysend-payment`,
      {
        callbackUrl: `${accountingCallbackUrl}/send/keysend`,
        ...request,
      },
    );

    if (res.data.success) {
      log.info(`ZBD send keysend response: ${JSON.stringify(res.data)}`);
    }

    return res.data;
  } catch (err) {
    return handleZbdApiError(err, `sendKeysend(${JSON.stringify(request)})`);
  }
}

export async function createCharge(
  request: CreateInvoiceRequest,
): Promise<ZBDCreateChargeLightningResponse> {
  try {
    const res = await client.post(`/charges`, {
      callbackUrl: `${accountingCallbackUrl}/receive/invoice`,
      ...request,
    });
    return res.data;
  } catch (err) {
    return handleZbdApiError(err, `createCharge(${JSON.stringify(request)})`);
  }
}

export async function getCharge(
  paymentId: string,
): Promise<ZBDGetChargeResponse> {
  try {
    const res = await client.get(`/charges/${paymentId}`);
    return res.data;
  } catch (err) {
    return handleZbdApiError(err, `getCharge(${paymentId})`);
  }
}

export async function sendPayment(
  request: SendPaymentRequest,
): Promise<ZBDSendPaymentResponse> {
  try {
    const res = await client.post(`/payments`, {
      callbackUrl: `${accountingCallbackUrl}/send/invoice`,
      ...request,
    });
    return res.data;
  } catch (err) {
    return handleZbdApiError(err, `sendPayment(${JSON.stringify(request)})`);
  }
}

export async function payToLightningAddress(
  request: LightningAddressPaymentRequest,
): Promise<ZBDSendPaymentResponse> {
  try {
    const res = await client.post(`/ln-address/send-payment`, {
      callbackUrl: `${accountingCallbackUrl}/send/invoice`,
      ...request,
    });
    return res.data;
  } catch (err) {
    return handleZbdApiError(
      err,
      `payToLightningAddress(${JSON.stringify(request)})`,
    );
  }
}

export async function validateLightningAddress(
  lightningAddress: string,
): Promise<boolean> {
  try {
    const res = await client.get(`/ln-address/validate/${lightningAddress}`);
    if (res.data.success && res.data.data.valid !== undefined) {
      return res.data.data.valid;
    }
    log.warn(
      `Unexpected response format from validate-lightning-address: ${JSON.stringify(
        res.data,
      )}`,
    );
    return false;
  } catch (err) {
    log.error(`Error validating lightning address ${lightningAddress}:`, err);
    return false;
  }
}

// ZBD Pay Ramp Widget Functions
export async function createRampWidget(
  request: CreateRampWidgetRequest,
): Promise<ZBDRampWidgetResponse> {
  try {
    log.info(`Creating ZBD ramp widget for email: ${request.email}`);

    const res = await rampClient.post<ZBDRampWidgetResponse>(`/ramp-widget`, {
      email: request.email,
      webhook_url: request.webhook_url,
      quote_currency: request.quote_currency || "USD",
      base_currency: request.base_currency || "BTC",
      destination: request.destination,
      reference_id: request.reference_id,
      metadata: request.metadata,
    });

    if (res.data.success) {
      log.info(
        `ZBD ramp widget created successfully: ${JSON.stringify(res.data)}`,
      );
    } else {
      log.error(`ZBD ramp widget creation failed: ${JSON.stringify(res.data)}`);
    }

    return res.data;
  } catch (err) {
    return handleZbdApiError(
      err,
      `createRampWidget(${JSON.stringify(request)})`,
    );
  }
}
