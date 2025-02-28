import log from "./winston";

import { hexToBytes } from "@noble/hashes/utils";
import { randomInt } from "crypto";
import { finalizeEvent, nip04, Relay, VerifiedEvent } from "nostr-tools";

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
}

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
    
    Enjoy the event!
    
    
    | ${ticketedEvent.name} | ${ticketedEvent.dt_start} | ${ticketedEvent.location}  | ${ticket.id}  | ${ticketedEvent.id}`;

  const signedEvent = await createEncryptedMessage(
    message,
    ticket.recipient_pubkey
  );
  log.info(`Encrypted message created, eventId: ${signedEvent.id}`);

  // Send DM to buyer
  const relay = await Relay.connect(process.env.WAVLAKE_RELAY);
  log.info(`Connected to ${relay.url}`);

  await relay.publish(signedEvent);
  relay.close();
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

const SECRET_KEY_BYTES = hexToBytes(process.env.SECRET_KEY);
const createEncryptedMessage = async (
  message: string,
  recipientPublicKey: string
): Promise<VerifiedEvent> => {
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
