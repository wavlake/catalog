import {
  CreateInvoiceRequest,
  SendKeysendRequest,
  SendKeysendResponse,
  SendPaymentRequest,
  SendPaymentResponse,
} from "../../types/zbd";
import { ZBDCreateChargeLightning } from "./interfaces";
import log from "loglevel";
const axios = require("axios").default;

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
  const { data } = await client
    .get(`https://api.zebedee.io/v0/is-supported-region/${ipAddress}`)
    .catch((err) => {
      log.trace(err);
      return err.response;
    });

  return data.data.isSupported;
}

export async function sendKeysend(
  request: SendKeysendRequest
): Promise<SendKeysendResponse> {
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
): Promise<ZBDCreateChargeLightning> {
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
): Promise<SendPaymentResponse> {
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
): Promise<SendPaymentResponse> {
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
