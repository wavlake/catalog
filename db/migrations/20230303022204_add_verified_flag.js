exports.up = function (knex) {
  return knex.schema.alterTable("artist", function (table) {
    table.boolean("verified").defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("artist", function (table) {
    table.dropColumn("verified");
  });
};
