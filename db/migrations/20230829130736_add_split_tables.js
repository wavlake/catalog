exports.up = function (knex) {
  return (
    knex.schema
      // Add split columns to amp table
      .alterTable("amp", function (table) {
        table.uuid("split_id").defaultTo(null).index("idx_amp_split_id");
        table
          .string("split_source")
          .defaultTo(null)
          .index("idx_amp_split_source");
        table
          .string("split_destination")
          .defaultTo(null)
          .index("idx_amp_split_destination");
        table
          .string("content_type", 12)
          .defaultTo("track")
          .index("idx_amp_content_type");
        table.dropColumn("source_region");
      })
      // Create split table
      .createTable("split", function (table) {
        table.increments("id").primary().unique();
        table.string("content_id").notNullable().index("idx_split_content_id");
        table
          .string("content_type", 12)
          .defaultTo("track")
          .index("idx_split_content_type");
        table.timestamp("created_at").defaultTo(knex.fn.now());
      })
      // Create split_allocation table
      .createTable("split_allocation", function (table) {
        table.increments("id").primary().unique();
        table
          .string("split_id")
          .notNullable()
          .index("idx_split_allocation_split_id");
        table.foreign("split_id").references("split.id");
        table
          .uuid("user_id")
          .notNullable()
          .index("idx_split_allocation_user_id");
        table
          .smallint("share")
          .notNullable()
          .checkPositive("split_allocation_share_check");
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.timestamp("updated_at").defaultTo(knex.fn.now());
      })
  );
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("amp", function (table) {
      table.string("source_region");
      table.dropColumn("split_id");
      table.dropColumn("split_destination");
      table.dropColumn("split_source");
    })
    .dropTableIfExists("split_allocation")
    .dropTableIfExists("split");
};
