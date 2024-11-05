exports.up = function (knex) {
  return knex.schema
    .alterTable("podcast", function (table) {
      table.boolean("is_feed_published").notNullable().defaultTo(true);
    })
    .alterTable("album", function (table) {
      table.boolean("is_feed_published").notNullable().defaultTo(true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("podcast", function (table) {
      table.dropColumn("is_feed_published");
    })
    .alterTable("album", function (table) {
      table.dropColumn("is_feed_published");
    });
};
