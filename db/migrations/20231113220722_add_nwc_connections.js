exports.up = function (knex) {
  return knex.schema.createTable("wallet_connection", function (table) {
    table.text("pubkey").primary();
    table.text("user_id").notNullable();
    table.foreign("user_id").references("user.id");
    table.text("name");
    table.timestamp("last_used");
    table.boolean("pay_invoice");
    table.boolean("get_balance");
    table.boolean("make_invoice");
    table.boolean("lookup_invoice");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("wallet_connection");
};
