import log from "loglevel";
import db from "../db";
import { getUserName } from "../userHelper";
import { ExternalKeysend } from "./interfaces";
import { processSplits } from "../amp";

const wavlakePubkey = process.env.KEYSEND_RECEIVING_PUBLIC_KEY;

async function checkIfKeysendIsInternal(keysend) {
  if (keysend.pubkey != wavlakePubkey) {
    return false;
  } else {
    if (keysend.customKey == 16180339) {
      return true;
    }
    return false;
  }
}

async function findContentIdFromCustomKey(customKey, customValue) {
  if (customKey == 16180339) {
    return customValue;
  } else return null;
}

export const handleInternalKeysends = async (
  comment: string,
  keysends: ExternalKeysend[],
  userId: string
) => {
  let remainingKeysends = [];
  for (let keysend of keysends) {
    const isInternal = await checkIfKeysendIsInternal(keysend);
    if (isInternal) {
      const trx = await db.knex.transaction();

      const contentId = await findContentIdFromCustomKey(
        keysend.customKey,
        keysend.customValue
      );

      log.debug(
        `Creating internal amp from external keysend for user: ${userId} to ${contentId}`
      );

      const amp = await processSplits({
        contentId: contentId,
        userId: userId,
        paymentType: 1,
        msatAmount: keysend.msatAmount,
        comment: comment,
        contentTime: null,
      });
    } else {
      remainingKeysends.push(keysend);
    }
  }
  return remainingKeysends;
};
