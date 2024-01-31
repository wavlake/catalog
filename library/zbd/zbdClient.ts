import {
  CreateInvoiceRequest,
  SendKeysendRequest,
  SendPaymentRequest,
} from "./requestInterfaces";
import log from "loglevel";
import {
  ZBDCreateChargeLightningResponse,
  ZBDIsSupportedRegionResponse,
  ZBDSendKeysendPaymentResponse,
  ZBDSendPaymentResponse,
} from "./responseInterfaces";
import axios from "axios";

// Create ZBD instance
const zbdApiKey = process.env.ZBD_API_KEY;
const accountingCallbackUrl = `${process.env.ACCOUNTING_CALLBACK_URL}`;

const client = axios.create({
  baseURL: "https://api.zebedee.io/v0",
  headers: { apikey: zbdApiKey },
});

export async function getProductionIps(): Promise<Array<string>> {
  const { data } = await client
    .get("https://api.zebedee.io/v0/prod-ips")
    .catch((err) => {
      log.trace(err);
      return err.response;
    });

  return data.data.ips;
}

export async function isSupportedRegion(ipAddress: string): Promise<boolean> {
  return client
    .get<ZBDIsSupportedRegionResponse>(
      `https://api.zebedee.io/v0/is-supported-region/${ipAddress}`
    )
    .then((res) => {
      if (res.status !== 200) {
        log.trace(
          `"Unsuccessful ZBD is-supported-region call: ${res.statusText}`
        );
        return false;
      }

      return res.data.data.isSupported;
    })
    .catch((err) => {
      log.trace(err);
      return false;
    });
}

export async function sendKeysend(
  request: SendKeysendRequest
): Promise<ZBDSendKeysendPaymentResponse> {
  log.debug(request);
  const { data } = await client
    .post(`https://api.zebedee.io/v0/keysend-payment`, {
      callbackUrl: `${accountingCallbackUrl}/keysend}`,
      ...request,
    })
    .catch((err) => {
      log.trace(err);
      return err.response;
    });
  return data;
}

export async function createCharge(
  request: CreateInvoiceRequest
): Promise<ZBDCreateChargeLightningResponse> {
  const { data } = await client
    .post(`https://api.zebedee.io/v0/charges`, {
      callbackUrl: `${accountingCallbackUrl}/invoice}`,
      ...request,
    })
    .catch((err) => {
      log.trace(err);
      return err.response;
    });
  return data;
}

export async function getCharge(
  paymentId: string
): Promise<ZBDSendPaymentResponse> {
  const { data } = await client
    .get(`https://api.zebedee.io/v0/charges/${paymentId}`)
    .catch((err) => {
      log.trace(err);
      return err.response;
    });
  return data;
}

export async function sendPayment(
  request: SendPaymentRequest
): Promise<ZBDSendPaymentResponse> {
  const { data } = await client
    .post(`https://api.zebedee.io/v0/payments`, {
      callbackUrl: `${accountingCallbackUrl}/send/invoice}`,
      ...request,
    })
    .catch((err) => {
      log.trace(err);
      return err.response;
    });
  return data;
}
