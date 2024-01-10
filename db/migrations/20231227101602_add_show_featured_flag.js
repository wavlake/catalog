exports.up = function (knex) {
  return knex.schema.alterTable("podcast", function (table) {
    table.boolean("is_featured").notNullable().defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("podcast", function (table) {
    table.dropColumn("is_featured");
  });
};
