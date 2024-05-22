exports.up = function (knex) {
  return knex.schema.alterTable("user_pubkey", function (table) {
    table.jsonb("followers");
    table.jsonb("follows");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("user_pubkey", function (table) {
    table.dropColumn("followers");
    table.dropColumn("follows");
  });
};
