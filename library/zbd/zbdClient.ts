import {
  SendKeysendRequest,
  SendKeysendResponse,
  SendPaymentRequest,
  SendPaymentResponse,
} from "../../types/zbd";
import log from "loglevel";
const axios = require("axios").default;

// Create ZBD instance
const zbdApiKey = process.env.ZBD_API_KEY;
const zbdCallbackUrl = `${process.env.ZBD_CALLBACK_URL}/payments/callback/zbd`;

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
      callbackUrl: zbdCallbackUrl,
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
      callbackUrl: zbdCallbackUrl,
      ...request,
    })
    .catch((err) => {
      log.trace(err);
      return err.response;
    });
  return data;
}
