exports.up = function (knex) {
  return knex.schema.alterTable("artist", function (table) {
    table.string("npub", 64).defaultTo(null);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("artist", function (table) {
    table.dropColumn("npub");
  });
};
