exports.up = function (knex) {
  return knex.schema
    .alterTable("podcast", function (table) {
      table.bigInteger("msat_total").notNullable().defaultTo(0);
      table.check("msat_total >= 0", [], "podcast_msat_total_check");
    })
    .alterTable("album", function (table) {
      table.bigInteger("msat_total").notNullable().defaultTo(0);
      table.check("msat_total >= 0", [], "album_msat_total_check");
    })
    .alterTable("artist", function (table) {
      table.bigInteger("msat_total").notNullable().defaultTo(0);
      table.check("msat_total >= 0", [], "artist_msat_total_check");
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("podcast", function (table) {
      table.dropChecks(["podcast_msat_total_check"]);
      table.dropColumn("msat_total");
    })
    .alterTable("album", function (table) {
      table.dropChecks(["album_msat_total_check"]);
      table.dropColumn("msat_total");
    })
    .alterTable("artist", function (table) {
      table.dropChecks(["artist_msat_total_check"]);
      table.dropColumn("msat_total");
    });
};
