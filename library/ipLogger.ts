import axios from "axios";
import log from "./logger";

export async function logOutboundIpAddress() {
  try {
    // Make a request to an IP detection service
    const response = await axios.get("https://api.ipify.org?format=json");
    const ipAddress = response.data.ip;

    // Log the IP address
    log.info("Outbound IP address for this Cloud Run instance", {
      outboundIp: ipAddress,
      serviceDetails: {
        environment: process.env.NODE_ENV || "unknown",
      },
    });

    return ipAddress;
  } catch (error) {
    log.error("Failed to retrieve outbound IP address", {
      error: error.message,
    });
    return null;
  }
}
