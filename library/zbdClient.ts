import { zbd } from "@zbd/node";
const axios = require("axios").default;

// Create ZBD instance
const ZBD = new zbd(process.env.ZBD_API_KEY);

export async function getProductionIps(): Promise<Array<string>> {
  const { data } = await axios
    .get("https://api.zebedee.io/v0/prod-ips", {
      headers: { apikey: `${process.env.ZBD_API_KEY}` },
    })
    .catch((err) => {
      console.log(err);
    });

  return data.data.ips;
}

export async function isSupportedRegion(ipAddress: string): Promise<boolean> {
  const { data } = await axios
    .get(`https://api.zebedee.io/v0/is-supported-region/${ipAddress}`, {
      headers: { apikey: `${process.env.ZBD_API_KEY}` },
    })
    .catch((err) => {
      console.log(err);
    });

  return data.data.isSupported;
}
