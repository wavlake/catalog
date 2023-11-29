exports.up = function (knex) {
  return knex.schema.createTable("nwc_wallet_transaction", function (table) {
    table.increments("id").primary();
    table.text("pubkey").notNullable();
    table.foreign("pubkey").references("wallet_connection.pubkey");
    table.integer("msat_amount").notNullable();
    table.datetime("created_at").notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("nwc_wallet_transaction");
};
