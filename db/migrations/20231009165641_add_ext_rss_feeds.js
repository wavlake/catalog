exports.up = function (knex) {
  return knex.schema.createTable("external_feed", function (table) {
    table.increments("id").primary().unique();
    table.text("feed_url").notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("external_feed");
};