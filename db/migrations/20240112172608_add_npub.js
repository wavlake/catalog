exports.up = function (knex) {
  return knex.schema.createTable("npub", function (table) {
    table.string("npub").primary().unique();
    table.json("metadata");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("npub");
};
