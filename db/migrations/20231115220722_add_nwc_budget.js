exports.up = function (knex) {
  return knex.schema.alterTable("wallet_connection", function (table) {
    table.integer("budget").notNullable();
    table.check("budget >= 0", [], "connection_budget_check");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("wallet_connection", function (table) {
    table.dropChecks(["connection_budget_check"]);
    table.dropColumn("budget");
  });
};
