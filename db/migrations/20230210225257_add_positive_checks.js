exports.up = function (knex) {
  return knex.schema
    .alterTable("user", function (table) {
      table.check("msat_balance >= 0", [], "user_balance_check");
      table.check("amp_msat >= 1000", [], "amp_msat_check");
    })
    .alterTable("amp", function (table) {
      table.check("msat_amount >= 1000", [], "amp_msat_amount_check");
    })
    .alterTable("track", function (table) {
      table.check("msat_total >= 0", [], "track_total_check");
    })
    .alterTable("transaction", function (table) {
      table.check("fee_msat >= 0", [], "tx_fee_msat_check");
      table
        .bigInteger("msat_amount")
        .notNullable()
        .checkPositive("tx_msat_amount_check")
        .alter();
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("user", function (table) {
      table.dropChecks(["user_balance_check"]);
      table.dropChecks(["amp_msat_check"]);
    })
    .alterTable("amp", function (table) {
      table.dropChecks(["amp_msat_amount_check"]);
    })
    .alterTable("track", function (table) {
      table.dropChecks(["track_total_check"]);
    })
    .alterTable("transaction", function (table) {
      table.dropChecks(["tx_fee_msat_check", "tx_msat_amount_check"]);
    });
};
