exports.up = function (knex) {
  return knex.schema.createTable("external_feed", function (table) {
    table.uuid("guid").primary().unique();
    table.text("title").notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("external_feed");
};
