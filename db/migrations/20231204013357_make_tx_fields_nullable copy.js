exports.up = function (knex) {
  return knex.schema
    .createTable("podcast_category", function (table) {
      table.increments("id").primary().unique();
      table
        .string("name", 64)
        .unique()
        .notNullable()
        .index("idx_podcast_category_name");
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })
    .alterTable("podcast", function (table) {
      table.integer("category_id");
      table.foreign("category_id").references("podcast_category.id");
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("podcast", function (table) {
      table.dropForeign("category_id");
      table.dropColumn("category_id");
    })
    .dropTableIfExists("podcast_category");
};
