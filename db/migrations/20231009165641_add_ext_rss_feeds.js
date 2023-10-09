exports.up = function (knex) {
  return knex.schema.createTable("feeds", function (table) {
    table.increments("id").primary().unique();
    table.string("feed_url").notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("feeds");
};
