exports.up = function (knex) {
  return knex.schema
    .createTable("music_genre", function (table) {
      table.increments("id").primary().unique();
      table
        .string("name", 64)
        .unique()
        .notNullable()
        .index("idx_music_genre_name");
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })
    .createTable("music_subgenre", function (table) {
      table.increments("id").primary().unique();
      table.integer("genre_id").notNullable();
      table.foreign("genre_id").references("music_genre.id");
      table
        .string("name", 64)
        .unique()
        .notNullable()
        .index("idx_music_subgenre_name");
      table.timestamp("created_at").defaultTo(knex.fn.now());
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("music_subgenre")
    .dropTableIfExists("music_genre");
};
