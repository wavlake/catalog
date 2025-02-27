import { randomInt } from "crypto";
export const sendTicketDm = async (
  recipientPubkey: string,
  ticketId: number,
  ticketedEventId: string
): Promise<void> => {
  // TODO
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
