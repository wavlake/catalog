exports.up = function (knex) {
  return knex.schema.alterTable("artist", function (table) {
    table.boolean("deleted").defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("artist", function (table) {
    table.dropColumn("deleted");
  });
};
