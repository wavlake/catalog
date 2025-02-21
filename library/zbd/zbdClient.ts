import {
  CreateInvoiceRequest,
  SendKeysendRequest,
  SendPaymentRequest,
  LightningAddressPaymentRequest,
} from "./requestInterfaces";
import log from "../winston";
import {
  ZBDGetChargeResponse,
  ZBDCreateChargeLightningResponse,
  ZBDIsSupportedRegionResponse,
  ZBDSendKeysendPaymentResponse,
  ZBDSendPaymentResponse,
} from "./responseInterfaces";
import axios, { AxiosError } from "axios";

// Create ZBD instance
const zbdApiKey = process.env.ZBD_API_KEY;
const accountingCallbackUrl = `${process.env.ACCOUNTING_CALLBACK_URL}`;

const client = axios.create({
  baseURL: "https://api.zebedee.io/v0",
  headers: { apikey: zbdApiKey },
});

export async function getPaymentStatus(
  paymentId: string
): Promise<ZBDSendPaymentResponse> {
  return client
    .get(`https://api.zebedee.io/v0/payments/${paymentId}`)
    .then((res) => {
      return res.data;
    })
    .catch((err) => {
      log.error(err);
      return err.response;
    });
}

export async function getProductionIps(): Promise<Array<string>> {
  const { data } = await client
    .get("https://api.zebedee.io/v0/prod-ips")
    .catch((err) => {
      log.error(err);
      return err.response;
    });

  return data.data.ips;
}

export async function isSupportedRegion(ipAddress: string): Promise<boolean> {
  console.log("Checking if region is supported", ipAddress);
  return client
    .get<ZBDIsSupportedRegionResponse>(
      `https://api.zebedee.io/v0/is-supported-region/${ipAddress}`
    )
    .then((res) => {
      log.info(`ZBD is-supported-region response: ${JSON.stringify(res.data)}`);
      return res.data.data.isSupported;
    })
    .catch((err) => {
      console.log("11111res", err.Response);
      console.log("22222req", err.Request);
      log.error(err);
      return false;
    });
}

export async function sendKeysend(request: SendKeysendRequest) {
  return client
    .post<ZBDSendKeysendPaymentResponse>(
      `https://api.zebedee.io/v0/keysend-payment`,
      {
        callbackUrl: `${accountingCallbackUrl}/send/keysend`,
        ...request,
      }
    )
    .then((res) => {
      log.info(`ZBD send keysend response: ${JSON.stringify(res.data)}`);
      return res.data;
    })
    .catch((err) => {
      log.error(err);
      return;
    });
}

export async function createCharge(
  request: CreateInvoiceRequest
): Promise<ZBDCreateChargeLightningResponse> {
  const { data } = await client
    .post(`https://api.zebedee.io/v0/charges`, {
      callbackUrl: `${accountingCallbackUrl}/receive/invoice`,
      ...request,
    })
    .catch((err) => {
      log.error(err);
      return err.response;
    });
  return data;
}

export async function getCharge(
  paymentId: string
): Promise<ZBDGetChargeResponse> {
  const { data } = await client
    .get(`https://api.zebedee.io/v0/charges/${paymentId}`)
    .catch((err) => {
      log.error(err);
      return err.response;
    });
  return data;
}

export async function sendPayment(
  request: SendPaymentRequest
): Promise<ZBDSendPaymentResponse> {
  const { data } = await client
    .post(`https://api.zebedee.io/v0/payments`, {
      callbackUrl: `${accountingCallbackUrl}/send/invoice`,
      ...request,
    })
    .catch((err) => {
      log.error(err);
      return err.response;
    });
  return data;
}

export async function payToLightningAddress(
  request: LightningAddressPaymentRequest
): Promise<ZBDSendPaymentResponse | AxiosError<unknown, any>> {
  try {
    const { data } = await client.post(
      `https://api.zebedee.io/v0/ln-address/send-payment`,
      {
        callbackUrl: `${accountingCallbackUrl}/send/invoice`,
        ...request,
      }
    );
    return data;
  } catch (err) {
    log.error(err);
    if (axios.isAxiosError(err)) {
      return err as AxiosError;
    } else {
      // Just a stock error
      return err;
    }
  }
}

export async function validateLightningAddress(
  lightningAddress: string
): Promise<boolean> {
  return client
    .get(`https://api.zebedee.io/v0/ln-address/validate/${lightningAddress}`)
    .then((res) => {
      console.log("valid?", res.data);
      return res.data.data.valid;
    })
    .catch((err) => {
      log.error(err);
      return false;
    });
}
