exports.up = function (knex) {
  return knex.schema.createTable("user_pubkey", function (table) {
    table.text("pubkey", 64).unique().primary();
    table.text("user_id", 64);
    table.datetime("created_at").notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("user_pubkey");
};
