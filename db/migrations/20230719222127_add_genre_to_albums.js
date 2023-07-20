exports.up = function (knex) {
  return knex.schema.alterTable("album", function (table) {
    table.integer("genre_id");
    table.foreign("genre_id").references("music_genre.id");
    table.integer("subgenre_id");
    table.foreign("subgenre_id").references("music_subgenre.id");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("album", function (table) {
    table.dropForeign("genre_id");
    table.dropForeign("subgenre_id");
    table.dropColumn("genre_id");
    table.dropColumn("subgenre_id");
  });
};
