exports.up = function (knex) {
  return knex.schema
    .alterTable("artist", function (table) {
      table.string("bio", 200);
      table.string("twitter");
      table.string("instagram");
      table.string("youtube");
      table.string("website");
    })
    .alterTable("amp", function (table) {
      table.string("source_region");
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("artist", function (table) {
      table.dropColumn("bio");
      table.dropColumn("twitter");
      table.dropColumn("instagram");
      table.dropColumn("youtube");
      table.dropColumn("website");
    })
    .alterTable("amp", function (table) {
      table.dropColumn("source_region");
    });
};
