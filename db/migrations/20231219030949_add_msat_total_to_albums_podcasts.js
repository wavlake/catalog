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
    .alterTable("zap_request", function (table) {
      table.bigInteger("timestamp");
      table.check("timestamp >= 0", [], "zap_request_timestamp_check");
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
    });
  .alterTable("zap_request", function (table) {
    table.dropChecks(["zap_request_timestamp_check"]);
    table.dropColumn("timestamp");
  });
};
