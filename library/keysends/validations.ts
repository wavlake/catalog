import db from "../db";
import { ExternalKeysendRequest } from "./interfaces";

export const isValidExternalKeysendRequest = (
  externalKeysendRequest: ExternalKeysendRequest
) => {
  const hasKeysendArray = Array.isArray(externalKeysendRequest?.keysends);
  if (!hasKeysendArray) {
    return false;
  }
  if (!externalKeysendRequest?.msatTotal) {
    return false;
  }
  let msatSumKeysends = 0;
  const hasValidKeysends = externalKeysendRequest.keysends.every((keysend) => {
    // Check if keysend has msatAmount and pubkey at a minimum
    // Also check if msatAmounts sum up to msatTotal
    if (keysend.msatAmount && keysend.pubkey) {
      msatSumKeysends += keysend.msatAmount;
      return true;
    } else {
      return false;
    }
  });
  if (msatSumKeysends != externalKeysendRequest.msatTotal) {
    return false;
  }
  return hasValidKeysends;
};
