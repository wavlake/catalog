exports.up = function (knex) {
  return knex.schema.alterTable("ticket", function (table) {
    table.text("external_transaction_id").notNullable();
    table.text("payment_request").notNullable();

    table.dropForeign("external_receive_id");
    table.dropColumn("external_receive_id");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("ticket", function (table) {
    table.dropColumn("external_transaction_id");
    table.dropColumn("payment_request");

    table.integer("external_receive_id").notNullable();
    table.foreign("external_receive_id").references("external_receive.id");
  });
};
