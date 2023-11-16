exports.up = function (knex) {
  return knex.schema.alterTable("wallet_connection", function (table) {
    table.integer("msat_budget").notNullable();
    table.check("msat_budget >= 0", [], "connection_msat_budget_check");
    table.integer("max_msat_payment_amount").notNullable();
    table.check(
      "max_msat_payment_amount >= 0",
      [],
      "connection_max_msat_payment_amount_check"
    );
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("wallet_connection", function (table) {
    table.dropChecks(["connection_msat_budget_check"]);
    table.dropColumn("msat_budget");
    table.dropChecks(["connection_max_msat_payment_amount_check"]);
    table.dropColumn("max_msat_payment_amount");
  });
};
