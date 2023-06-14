exports.up = function (knex) {
  return knex.schema
    .createTable("event_track", function (table) {
      table.string("event_id", 64).primary().unique().index("idx_event_id");
      table.uuid("track_id").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })
    .createTable("zap_request", function (table) {
      table
        .string("payment_hash")
        .primary()
        .unique()
        .index("idx_zap_payment_hash");
      table.string("event_id", 64);
      table.text("event").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("event_track")
    .dropTableIfExists("zap_request");
};
