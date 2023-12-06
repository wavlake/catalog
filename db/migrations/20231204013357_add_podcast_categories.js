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
    .createTable("podcast_subcategory", function (table) {
      table.increments("id").primary().unique();
      table.integer("category_id").notNullable();
      table.foreign("category_id").references("podcast_category.id");
      table
        .string("name", 64)
        .unique()
        .notNullable()
        .index("idx_podcast_subcategory_name");
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })
    .alterTable("podcast", function (table) {
      table.integer("primary_category_id");
      table.foreign("primary_category_id").references("podcast_category.id");
      table.integer("secondary_category_id");
      table.foreign("secondary_category_id").references("podcast_category.id");
      table.integer("primary_subcategory_id");
      table
        .foreign("primary_subcategory_id")
        .references("podcast_subcategory.id");
      table.integer("secondary_subcategory_id");
      table
        .foreign("secondary_subcategory_id")
        .references("podcast_subcategory.id");
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("podcast", function (table) {
      table.dropForeign("primary_category_id");
      table.dropForeign("secondary_category_id");
      table.dropForeign("primary_subcategory_id");
      table.dropForeign("secondary_subcategory_id");
      table.dropColumn("primary_category_id");
      table.dropColumn("secondary_category_id");
      table.dropColumn("primary_subcategory_id");
      table.dropColumn("secondary_subcategory_id");
    })
    .alterTable("podcast_subcategory", function (table) {
      table.dropIndex("name", "idx_podcast_subcategory_name");
      table.dropForeign("category_id");
    })
    .alterTable("podcast_category", function (table) {
      table.dropIndex("name", "idx_podcast_category_name");
    })
    .dropTableIfExists("podcast_category")
    .dropTableIfExists("podcast_subcategory");
};
