exports.up = function (knex) {
  return knex.schema.alterTable("wallet_connection", function (table) {
    table.integer("budget");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("wallet_connection", function (table) {
    table.dropColumn("budget");
  });
};
