exports.up = function (knex) {
  return knex.schema
    .createTable("user_pubkey", function (table) {
      table.text("pubkey", 64).unique().primary();
      table
        .text("user_id", 64)
        .notNullable()
        .references("id")
        .inTable("user")
        .index("idx_user_pubkey_user_id");
      table.datetime("created_at").notNullable();
    })
    .alterTable("user_verification", function (table) {
      table.foreign("user_id").references("user.id");
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("user_pubkey")
    .alterTable("user_verification", function (table) {
      table.dropForeign("user_id");
    });
};
