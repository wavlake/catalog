exports.up = function (knex) {
  return knex.schema.createTable("npub", function (table) {
    table.string("public_hex").primary().unique();
    table.jsonb("metadata");
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("npub");
};
