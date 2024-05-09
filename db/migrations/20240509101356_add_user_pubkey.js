exports.up = function (knex) {
  return knex.schema.createTable("user_pubkey", function (table) {
    table.string("pubkey").notNullable().primary().unique();
    table.string("user_id", 64);
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("user_pubkey");
};
