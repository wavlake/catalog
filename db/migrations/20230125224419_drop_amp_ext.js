exports.up = function (knex) {
  return knex.schema
    .alterTable("amp", function (table) {
      table.integer("type");
      table.integer("type_key");
      table
        .integer("msat_amount")
        .notNullable()
        .checkPositive("amp_check")
        .alter();
    })
    .createTable("external_receive", function (table) {
      table.increments("id").primary().unique();
      table.integer("settle_index");
      table.string("preimage", 64);
      table.uuid("track_id");
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })
    .createTable("amp_type", function (table) {
      table.increments("id").primary().unique();
      table.string("description", 64);
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })
    .dropTableIfExists("amp_ext");
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("amp", function (table) {
      table.dropColumn("type");
      table.dropColumn("type_key");
      table.dropChecks(["amp_check"]);
    })
    .dropTableIfExists("amp_type")
    .dropTableIfExists("external_receive");
};
