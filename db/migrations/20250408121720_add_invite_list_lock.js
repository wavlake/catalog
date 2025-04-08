exports.up = function (knex) {
  return knex.schema.alterTable("invite_lists", function (table) {
    table.boolean("is_locked").defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("invite_lists", function (table) {
    table.dropColumn("is_locked");
  });
};
