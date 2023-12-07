exports.up = function (knex) {
  return knex.schema.alterTable("wallet_connection", function (table) {
    table.boolean("deleted").notNullable().defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("wallet_connection", function (table) {
    table.dropColumn("deleted");
  });
};
