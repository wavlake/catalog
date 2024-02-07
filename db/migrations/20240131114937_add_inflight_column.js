exports.up = function (knex) {
  return knex.schema.alterTable("external_payment", function (table) {
    table.boolean("is_pending").defaultTo(true);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("external_payment", function (table) {
    table.dropColumn("is_pending");
  });
};