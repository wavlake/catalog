exports.up = function (knex) {
  return knex.schema
    .createTable("playlist", function (table) {
      table.uuid("id").primary().unique();
      table.string("user_id", 64).notNullable().index("idx_playlist_user_id");
      table.string("title").notNullable();
      table.boolean("is_favorites").defaultTo(false);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    })
    .createTable("playlist_track", function (table) {
      table.increments("id").primary().unique();
      table.uuid("track_id").notNullable();
      table
        .uuid("playlist_id")
        .notNullable()
        .index("idx_playlist_track_playlist_id");
      table.string("order", 16).notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("playlist")
    .dropTableIfExists("playlist_track");
};
