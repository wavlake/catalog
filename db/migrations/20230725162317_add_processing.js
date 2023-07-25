exports.up = function (knex) {
  return knex.schema.alterTable("track", function (table) {
    table.boolean("is_processing").defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("track", function (table) {
    table.dropColumn("is_processing");
  });
};
