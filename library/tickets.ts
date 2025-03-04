import log from "./winston";

import { hexToBytes } from "@noble/hashes/utils";
import { randomInt } from "crypto";
import { finalizeEvent, nip04, SimplePool, VerifiedEvent } from "nostr-tools";
import { DEFAULT_WRITE_RELAY_URIS } from "./nostr/common";

interface TicketEvent {
  name: string;
  location: string;
  id: string;
  description: string;
  price_msat: number;
  total_tickets: number;
  max_tickets_per_person: number;
  user_id: string;
  dt_start: Date;
  dt_end: Date | null;
}
interface Ticket {
  id: number;
  ticketed_event_id: string;
  is_used: boolean;
  is_paid: boolean;
  is_pending: boolean;
  created_at: Date | null;
  updated_at: Date | null;
  nostr: any;
  ticket_secret: string | null;
  used_at: Date | null;
  price_msat: number;
  recipient_pubkey: string;
  external_transaction_id: string;
  payment_request: string;
  count: number;
}

const DELIMETER = " | ";
export const sendTicketDm = async (
  ticketedEvent: TicketEvent,
  ticket: Ticket
): Promise<void> => {
  log.debug(
    `Sending ticket to buyer: ${ticket.recipient_pubkey}, ticketId: ${ticket.id} eventId: ${ticketedEvent.id}`
  );

  const message = `
  Thanks for purchasing a ticket to ${ticketedEvent.name}!
  
  Here's your unique ticket code to get into the event: ${ticket.ticket_secret}
  
  Details: ${ticketedEvent.dt_start} at ${ticketedEvent.location}
  
  Enjoy the event!\n\n`;

  const ticketMetadata = [
    message,
    ticket.ticket_secret,
    ticket.id.toString(),
    ticket.count.toString(),
    ticketedEvent.id,
  ];

  const formattedMessage = ticketMetadata.join(DELIMETER);
  const signedEvent = await createEncryptedMessage(
    formattedMessage,
    ticket.recipient_pubkey
  );
  log.info(`Encrypted message created, eventId: ${signedEvent.id}`);

  // Send DM to buyer
  const pool = new SimplePool();

  const result = await Promise.allSettled(
    pool.publish(DEFAULT_WRITE_RELAY_URIS, signedEvent)
  );

  return;
};

/**
 * Generates a random alphanumeric validation code for event tickets.
 *
 * @param {number} length - Length of the code, defaults to 6
 * @returns {string} A random alphanumeric validation code
 */
export function generateValidationCode(length = 6) {
  // Define the character set - uppercase letters and digits
  // Excluding easily confused characters like 0, O, 1, I, etc.
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

  // Generate the code
  let code = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = randomInt(0, chars.length);
    code += chars[randomIndex];
  }

  return code;
}

const daysOfTheWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const prettifyDateString = (x: string) => {
  const date = new Date(x);
  const day = daysOfTheWeek[date.getDay()];
  const month = date.toLocaleString("default", { month: "short" });
  const dayOfMonth = date.getDate();
  const year = date.getFullYear();
  return `${day}, ${month} ${dayOfMonth}, ${year}`;
};

const prettifyTimeString = (x: string) => {
  // Remove leading 0 from string if it exists
  return x.replace(/^0/, "");
};

const normalizeTimeString = (x: string) => {
  // Remove trailing AM or PM from string if it exists
  return x.replace(/(AM|PM)$/, "").trim();
};

const createEncryptedMessage = async (
  message: string,
  recipientPublicKey: string
): Promise<VerifiedEvent> => {
  const secretKey = process.env.TICKET_SECRET_KEY;
  if (!secretKey) {
    throw new Error("TICKET_SECRET_KEY is required");
  }

  const SECRET_KEY_BYTES = hexToBytes(secretKey);
  const encryptedContent = await nip04.encrypt(
    SECRET_KEY_BYTES,
    recipientPublicKey,
    message
  );

  let event = {
    created_at: Math.floor(Date.now() / 1000),
    kind: 4,
    tags: [["p", recipientPublicKey]],
    content: encryptedContent,
  };

  return finalizeEvent(event, SECRET_KEY_BYTES);
};
