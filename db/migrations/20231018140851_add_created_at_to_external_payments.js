exports.up = function (knex) {
  return knex.schema.alterTable("external_payment", function (table) {
    table.uuid("tx_id");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("external_payment", function (table) {
    table.dropColumn("tx_id");
    table.dropColumn("created_at");
    table.dropColumn("updated_at");
  });
};
