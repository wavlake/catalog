exports.up = function (knex) {
  return knex.schema.alterTable("user_pubkey", function (table) {
    table.integer("follower_count").defaultTo(0);
    table.jsonb("follows");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("user_pubkey", function (table) {
    table.dropColumn("follower_count");
    table.dropColumn("follows");
  });
};
