import db from "../db";

export const isValidExternalKeysendRequest = async (externalKeysendRequest) => {
  const hasKeysendArray = Array.isArray(externalKeysendRequest?.keysends);
  if (!hasKeysendArray) {
    return false;
  }
  if (!externalKeysendRequest?.msatTotal) {
    return false;
  }
  let hasValidKeysends = false;
  let msatSumKeysends = 0;
  externalKeysendRequest.keysends.forEach((keysend) => {
    // Check if keysend has msatAmount and pubkey at a minimum
    // Also check if msatAmounts sum up to msatTotal
    if (keysend.msatAmount && keysend.pubkey) {
      hasValidKeysends = true;
      msatSumKeysends += parseInt(keysend.msatAmount);
    } else {
      return false;
    }
  });
  if (msatSumKeysends != externalKeysendRequest.msatTotal) {
    return false;
  }
  return hasValidKeysends;
};

export const checkUserHasSufficientSats = (userId, msatAmount) => {
  return db
    .knex("user")
    .select("user.msat_balance as msatBalance")
    .where("user.id", "=", userId)
    .first()
    .then((userData) => {
      if (!userData) {
        return false;
      }
      return parseInt(userData.msatBalance) > parseInt(msatAmount);
    })
    .catch((err) => {
      log.debug(`Error querying user table: ${err}`);
      return false;
    });
};
