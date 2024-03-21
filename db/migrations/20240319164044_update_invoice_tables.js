exports.up = function (knex) {
  return knex.schema
    .alterTable("external_receive", function (table) {
      table.string("external_id").nullable();
      table.timestamp("updated_at").nullable();
      table.boolean("is_pending").defaultTo(false); // Set default to false for existing records
    })
    .alterTable("external_payment", function (table) {
      table.string("external_id").nullable();
      table.boolean("is_pending").defaultTo(false);
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("external_receive", function (table) {
      table.dropColumn("external_id");
      table.dropColumn("updated_at");
      table.dropColumn("is_pending");
    })
    .alterTable("external_payment", function (table) {
      table.dropColumn("external_id");
      table.dropColumn("is_pending");
    });
};
