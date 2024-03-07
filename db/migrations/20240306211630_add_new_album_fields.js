exports.up = function (knex) {
  return knex.schema
    .alterTable("album", function (table) {
      table.boolean("is_single").defaultTo(false);
    })
    .alterTable("track", function (table) {
      table.boolean("is_explicit").defaultTo(false);
    })
    .alterTable("episode", function (table) {
      table.boolean("is_explicit").defaultTo(false);
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("album", function (table) {
      table.dropColumn("is_single");
    })
    .alterTable("track", function (table) {
      table.dropColumn("is_explicit");
    })
    .alterTable("episode", function (table) {
      table.dropColumn("is_explicit");
    });
};
