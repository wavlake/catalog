exports.up = function (knex) {
  return knex.schema.alterTable("playlist_track", function (table) {
    table.integer("order_int").unsigned().defaultTo(0);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("playlist_track", function (table) {
    table.dropColumn("order_int");
  });
};
