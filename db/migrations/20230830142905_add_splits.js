exports.up = function (knex) {
  return (
    knex.schema
      // Add split columns to amp table
      .alterTable("amp", function (table) {
        // split_tx column is a way to group splits that were created from the same tx
        table.uuid("split_tx").defaultTo(null).index("idx_amp_split");
        // time_split_source is the content set the time split
        table
          .uuid("time_split_source")
          .defaultTo(null)
          .index("idx_amp_time_split_source");
        // split_destination is the destination of the tx (typically a user)
        table
          .string("split_destination", 64)
          .defaultTo(null)
          .index("idx_amp_split_destination");
        // content_type describes track or podcast
        table
          .string("content_type", 12)
          .defaultTo("track")
          .index("idx_amp_content_type");
        table.dropColumn("source_region");
      })
      // Create split table
      .createTable("split", function (table) {
        table.increments("id").primary().unique();
        table.uuid("content_id").notNullable().index("idx_split_content_id");
        table
          .string("content_type", 12)
          .defaultTo("track")
          .index("idx_split_content_type");
        table.timestamp("created_at").defaultTo(knex.fn.now());
      })
      // Create split_recipient table
      .createTable("split_recipient", function (table) {
        table.increments("id").primary().unique();
        table
          .integer("split_id")
          .notNullable()
          .index("idx_split_recipient_split_id");
        table.foreign("split_id").references("split.id");
        table
          .string("user_id", 64)
          .notNullable()
          .index("idx_split_recipient_user_id");
        table
          .smallint("share")
          .notNullable()
          .checkPositive("split_recipient_share_check");
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.timestamp("updated_at").defaultTo(knex.fn.now());
      })
      // Create time_split table
      .createTable("time_split", function (table) {
        table.increments("id").primary().unique();
        table
          .uuid("content_id")
          .notNullable()
          .index("idx_time_split_content_id");
        table
          .smallint("share_numerator")
          .notNullable()
          .checkPositive("time_split_share_numerator_check");
        table
          .smallint("share_denominator")
          .notNullable()
          .checkPositive("time_split_share_denomitor_check");
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.timestamp("updated_at").defaultTo(knex.fn.now());
      })
  );
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("amp", function (table) {
      table.string("source_region");
      table.dropColumn("split_tx");
      table.dropColumn("split_destination");
      table.dropColumn("content_type");
    })
    .dropTableIfExists("split_recipient")
    .dropTableIfExists("split")
    .dropTableIfExists("time_split");
};
