exports.up = function (knex) {
  return knex.schema.alterTable("album", function (table) {
    table.string("description", 200);
    table.boolean("deleted").defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("album", function (table) {
    table.dropColumn("description");
    table.dropColumn("deleted");
  });
};
