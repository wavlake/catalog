import { sendPaymentPayload, sendPaymentResponse } from "../types/zbd";
import log from "loglevel";
const axios = require("axios").default;

// Create ZBD instance
const zbdApiKey = process.env.ZBD_API_KEY;

export async function getProductionIps(): Promise<Array<string>> {
  const { data } = await axios
    .get("https://api.zebedee.io/v0/prod-ips", {
      headers: { apikey: zbdApiKey },
    })
    .catch((err) => {
      log.trace(err);
      return err.response;
    });

  return data.data.ips;
}

export async function isSupportedRegion(ipAddress: string): Promise<boolean> {
  const { data } = await axios
    .get(`https://api.zebedee.io/v0/is-supported-region/${ipAddress}`, {
      headers: { apikey: zbdApiKey },
    })
    .catch((err) => {
      log.trace(err);
      return err.response;
    });

  return data.data.isSupported;
}

export async function sendPayment(
  payload: sendPaymentPayload
): Promise<sendPaymentResponse> {
  const { data } = await axios
    .post(
      `https://api.zebedee.io/v0/payments`,
      { ...payload },
      {
        headers: { apikey: zbdApiKey },
      }
    )
    .catch((err) => {
      log.trace(err);
      return err.response;
    });
  return data;
}
