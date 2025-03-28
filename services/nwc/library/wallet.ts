import db from "@library/db";

export async function getWalletUser(pubkey) {
  // console.info(weeklySpend);

  return db
    .knex("wallet_connection")
    .join("user", "wallet_connection.user_id", "=", "user.id")
    .select(
      "user.id as userId",
      "user.msat_balance as msatBalance",
      "msat_budget as msatBudget",
      "max_msat_payment_amount as maxMsatPaymentAmount"
    )
    .where("wallet_connection.pubkey", "=", pubkey)
    .first()
    .then((data) => data || null)
    .catch((err) => {
      console.error(`Error finding user from pubkey ${err}`);
    });
}

export async function updateWallet(pubkey, msatAmount: number) {
  const trx = await db.knex.transaction();
  return trx("wallet_connection")
    .where("pubkey", "=", pubkey)
    .update("last_used", db.knex.fn.now())
    .then(() => {
      return trx("nwc_wallet_transaction").where("pubkey", "=", pubkey).insert({
        pubkey: pubkey,
        msat_amount: msatAmount,
        created_at: db.knex.fn.now(),
      });
    })
    .then(trx.commit)
    .catch((err) => {
      console.error(`Error updating wallet connection ${err}`);
    });
}

export const walletHasRemainingBudget = async (
  walletPubkey,
  msatBudget,
  valueMsatInt: number
) => {
  console.log(`Getting budget remaining for NWC wallet: ${walletPubkey}`);

  // if the max budget is 0 then the user has no budget, its unlimited
  if (msatBudget === 0) {
    return true;
  }

  // Get total amp spend by user in last week to add to withdrawl spend
  return db
    .knex("nwc_wallet_transaction")
    .sum("msat_amount as msatAmpTotal")
    .where("pubkey", "=", walletPubkey)
    .andWhere("created_at", ">", db.knex.raw("now() - interval '7 days'"))
    .first()
    .then((data) => {
      // If there are no tx records then simply check if the budget is greater than the value
      if (data?.length === 0) {
        return parseInt(msatBudget) > valueMsatInt;
      }
      return parseInt(msatBudget) - data.msatAmpTotal > valueMsatInt;
    })
    .catch((err) => {
      console.error(`Error getting NWC wallet remaining budget ${err}`);
    });
};
