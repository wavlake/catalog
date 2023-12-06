exports.up = function (knex) {
  return knex.schema.alterTable("external_payment", function (table) {
    table.text("payment_index").nullable().alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("external_payment", function (table) {
    table.integer("payment_index").notNullable().alter();
  });
};
