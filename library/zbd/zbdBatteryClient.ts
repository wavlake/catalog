// zbdClient.ts
import {
  CreateInvoiceRequest,
  SendPaymentRequest,
  LightningAddressPaymentRequest,
} from "./requestInterfaces";
import log from "../logger";
import {
  ZBDGetChargeResponse,
  ZBDCreateChargeLightningResponse,
  ZBDIsSupportedRegionResponse,
  ZBDSendPaymentResponse,
  ZBDErrorResponse,
  ZBDWalletResponse,
  ZBDCreateStaticChargeResponse,
  ZBDGetStaticChargeResponse,
} from "./responseInterfaces";
import axios from "axios";
import { handleZbdApiError } from "../errors";

const zbdApiKey = process.env.ZBD_BATTERY_API_KEY;
const accountingCallbackUrl = `${process.env.ACCOUNTING_CALLBACK_URL}`;

const client = axios.create({
  baseURL: "https://api.zebedee.io/v0",
  headers: { apikey: zbdApiKey },
  timeout: 30000, // Increased timeout for payment processing (matches main ZBD client)
});

async function getPaymentStatus(
  paymentId: string,
): Promise<ZBDSendPaymentResponse> {
  try {
    const res = await client.get(`/payments/${paymentId}`);
    return res.data;
  } catch (err) {
    return handleZbdApiError(err, `battery-getPaymentStatus(${paymentId})`);
  }
}

async function getProductionIps(): Promise<
  string[] | (ZBDErrorResponse & { error: string })
> {
  try {
    const { data } = await client.get("/prod-ips");
    if (data?.data?.ips) {
      return data.data.ips;
    }
    return handleZbdApiError(
      "zbd prod-ips not properly formatted",
      "battery-getProductionIps()",
    );
  } catch (err) {
    return handleZbdApiError(err, "battery-getProductionIps()");
  }
}

async function isSupportedRegion(ipAddress: string): Promise<boolean> {
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
      `Unexpected response format from battery-is-supported-region: ${JSON.stringify(
        res.data,
      )}`,
    );
    return false;
  } catch (err) {
    log.error(`Error checking region support for IP ${ipAddress}:`, err);
    return false;
  }
}

async function createCharge(
  request: CreateInvoiceRequest,
): Promise<ZBDCreateChargeLightningResponse> {
  try {
    const res = await client.post(`/charges`, {
      callbackUrl: `${accountingCallbackUrl}/battery/receive/invoice`,
      ...request,
    });
    return res.data;
  } catch (err) {
    return handleZbdApiError(
      err,
      `battery-createCharge(${JSON.stringify(request)})`,
    );
  }
}

async function getCharge(paymentId: string): Promise<ZBDGetChargeResponse> {
  try {
    const res = await client.get(`/charges/${paymentId}`);
    return res.data;
  } catch (err) {
    return handleZbdApiError(err, `battery-getCharge(${paymentId})`);
  }
}

async function sendPayment(
  request: SendPaymentRequest,
): Promise<ZBDSendPaymentResponse> {
  try {
    const res = await client.post(`/payments`, {
      callbackUrl: `${accountingCallbackUrl}/battery/send/invoice`,
      ...request,
    });
    return res.data;
  } catch (err) {
    return handleZbdApiError(
      err,
      `battery-sendPayment(${JSON.stringify(request)})`,
    );
  }
}

async function payToLightningAddress(
  request: LightningAddressPaymentRequest,
): Promise<ZBDSendPaymentResponse> {
  try {
    const res = await client.post(`/ln-address/send-payment`, {
      callbackUrl: `${accountingCallbackUrl}/battery/send/invoice`,
      ...request,
    });
    return res.data;
  } catch (err) {
    return handleZbdApiError(
      err,
      `battery-payToLightningAddress(${JSON.stringify(request)})`,
    );
  }
}

async function validateLightningAddress(
  lightningAddress: string,
): Promise<boolean> {
  try {
    const res = await client.get(`/ln-address/validate/${lightningAddress}`);
    if (res.data.success && res.data.data.valid !== undefined) {
      return res.data.data.valid;
    }
    log.warn(
      `Unexpected response format from battery-validate-lightning-address: ${JSON.stringify(
        res.data,
      )}`,
    );
    return false;
  } catch (err) {
    log.error(`Error validating lightning address ${lightningAddress}:`, err);
    return false;
  }
}

async function balanceInfo(): Promise<ZBDWalletResponse> {
  try {
    const res = await client.get(`/wallet`);
    log.info(`ZBD balanceInfo response: ${JSON.stringify(res.data)}`);
    return res.data;
  } catch (err) {
    return handleZbdApiError(err, `battery-balanceInfo()`);
  }
}

interface CreateStaticChargeRequest {
  minAmount: string;
  maxAmount: string;
  description: string;
  successMessage: string;
  allowedSlots: number;
  internalId: string;
  identifier: string;
}

async function createStaticCharge(
  request: CreateStaticChargeRequest,
): Promise<ZBDCreateStaticChargeResponse> {
  try {
    const res = await client.post(`/static-charges`, {
      callbackUrl: `${accountingCallbackUrl}/receive/static-charge`,
      ...request,
    });
    return res.data;
  } catch (err) {
    return handleZbdApiError(err, `createStaticCharge()`);
  }
}

async function getStaticCharge(
  chargeId: string,
): Promise<ZBDGetStaticChargeResponse> {
  try {
    const res = await client.get(`/static-charges/${chargeId}`);
    return res.data;
  } catch (err) {
    return handleZbdApiError(err, `getStaticCharge(${chargeId})`);
  }
}

const createInvoice = async (
  request: CreateInvoiceRequest,
): Promise<ZBDCreateChargeLightningResponse> => {
  try {
    const res = await client.post(`/charges`, {
      callbackUrl: `${accountingCallbackUrl}/battery/receive/invoice`,
      ...request,
    });
    return res.data;
  } catch (err) {
    return handleZbdApiError(
      err,
      `battery-createInvoice(${JSON.stringify(request)})`,
    );
  }
};

export default {
  payToLNURL: payToLightningAddress,
  balanceInfo: balanceInfo,
  createInvoice,
};
