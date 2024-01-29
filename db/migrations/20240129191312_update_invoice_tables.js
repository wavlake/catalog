exports.up = function (knex) {
  return knex.schema
    .alterTable("external_receive", function (table) {
      table.string("external_id").nullable();
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    })
    .alterTable("external_payment", function (table) {
      table.boolean("external_id").nullable();
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("external_receive", function (table) {
      table.dropColumn("external_id");
      table.dropColumn("updated_at");
    })
    .alterTable("external_payment", function (table) {
      table.dropColumn("external_id");
    });
};
