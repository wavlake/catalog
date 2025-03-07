import { Decimal } from "@prisma/client/runtime/library";
import fetch from "node-fetch";
import log from "./winston";

const EXCHANGE_RATE_URL =
  "https://api.coinbase.com/v2/exchange-rates?currency=USD";
const SATS_PER_BTC = 100000000;
const MSATS_PER_SAT = 1000;

// Cache exchange rate to minimize API calls
let bitcoinPriceCache: {
  price: number;
  timestamp: number;
} | null = null;

// Cache expiration time (15 minutes)
const CACHE_EXPIRATION_MS = 15 * 60 * 1000;

/**
 * Fetch current Bitcoin price from Coinbase API
 */
export const fetchBitcoinPrice = async (): Promise<number> => {
  try {
    // Return cached price if available and not expired
    if (
      bitcoinPriceCache &&
      Date.now() - bitcoinPriceCache.timestamp < CACHE_EXPIRATION_MS
    ) {
      return bitcoinPriceCache.price;
    }

    const response = await fetch(EXCHANGE_RATE_URL);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as {
      data: { rates: Record<"BTC", string> };
    };

    const btcRate = 1 / parseFloat(data.data.rates.BTC);

    // Update cache
    bitcoinPriceCache = {
      price: btcRate,
      timestamp: Date.now(),
    };

    return btcRate;
  } catch (e: any) {
    log.error(`Error fetching Bitcoin price: ${e.message}`);

    // If we have a cached price, return it even if expired rather than failing
    if (bitcoinPriceCache) {
      log.info(
        `Using expired cached Bitcoin price: ${bitcoinPriceCache.price}`
      );
      return bitcoinPriceCache.price;
    }

    throw e;
  }
};

/**
 * Convert USD to millisatoshis
 * @param usd Amount in USD
 * @param currency Currency code (default: 'USD')
 * @returns Promise resolving to millisatoshis amount
 */
export const convertFiatToMsats = async (
  fiatAmount: number | Decimal,
  currency: string = "USD"
): Promise<number> => {
  // Currently only supporting USD, but can be extended for other currencies
  if (currency !== "USD") {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  const bitcoinPrice = await fetchBitcoinPrice();
  // Convert Decimal to number if needed
  const fiatAmountNumber =
    fiatAmount instanceof Decimal ? fiatAmount.toNumber() : fiatAmount;
  const btc = fiatAmountNumber / bitcoinPrice;
  const sats = Math.round(btc * SATS_PER_BTC);
  return sats * MSATS_PER_SAT;
};

/**
 * Convert millisatoshis to USD
 * @param msats Amount in millisatoshis
 * @returns Promise resolving to USD amount with 2 decimal places
 */
export const convertMsatsToFiat = async (msats: number): Promise<number> => {
  const bitcoinPrice = await fetchBitcoinPrice();
  const sats = msats / MSATS_PER_SAT;
  const btc = sats / SATS_PER_BTC;
  const rawUSD = btc * bitcoinPrice;
  // Two decimal places
  return Math.round(rawUSD * 100) / 100;
};
