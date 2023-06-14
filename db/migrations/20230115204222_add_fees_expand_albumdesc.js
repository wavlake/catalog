exports.up = function (knex) {
  return knex.schema
    .alterTable("album", function (table) {
      table.string("description", 1000).alter();
    })
    .alterTable("amp", function (table) {
      table.integer("fee_msat").defaultTo(0);
    })
    .alterTable("amp_ext", function (table) {
      table.integer("fee_msat").defaultTo(0);
    })
    .createTable("ranking_forty", function (table) {
      table.increments("id").primary().unique();
      table
        .string("track_id")
        .notNullable()
        .index("idx_ranking_forty_track_id");
      table.integer("rank").notNullable().defaultTo(1);
      table.timestamp("created_at").defaultTo(knex.fn.now());
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("album", function (table) {
      table.string("description", 200).alter();
    })
    .table("amp", function (table) {
      table.dropColumn("fee_msat");
    })
    .table("amp_ext", function (table) {
      table.dropColumn("fee_msat");
    })
    .dropTableIfExists("ranking_forty");
};
