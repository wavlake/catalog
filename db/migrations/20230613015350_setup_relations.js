exports.up = function (knex) {
  return knex.schema
    .alterTable("track", function (table) {
      table.foreign("album_id").references("album.id");
    })
    .alterTable("track", function (table) {
      table.foreign("artist_id").references("artist.id");
    })
    .alterTable("album", function (table) {
      table.foreign("artist_id").references("artist.id");
    })
    .alterTable("artist", function (table) {
      table.foreign("user_id").references("user.id");
    })
    .alterTable("transaction", function (table) {
      table.foreign("user_id").references("user.id");
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("track", function (table) {
      table.dropForeign("album_id");
    })
    .alterTable("track", function (table) {
      table.dropForeign("artist_id");
    })
    .alterTable("album", function (table) {
      table.dropForeign("artist_id");
    })
    .alterTable("artist", function (table) {
      table.dropForeign("user_id");
    })
    .alterTable("transaction", function (table) {
      table.dropForeign("user_id");
    });
};
