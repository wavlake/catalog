exports.up = function (knex) {
  return knex.schema.alterTable("wallet_connection", function (table) {
    table.integer("budget").notNullable();
    table.check("budget >= 0", [], "connection_budget_check");
    table.integer("max_payment_amount").notNullable();
    table.check(
      "max_payment_amount >= 0",
      [],
      "connection_max_payment_amount_check"
    );
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("wallet_connection", function (table) {
    table.dropChecks(["connection_budget_check"]);
    table.dropColumn("budget");
    table.dropChecks(["connection_max_payment_amount_check"]);
    table.dropColumn("max_payment_amount");
  });
};
