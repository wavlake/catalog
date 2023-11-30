exports.up = function (knex) {
  return knex.schema.alterTable("transaction", function (table) {
    table.text("payment_hash").nullable().alter();
    table.integer("fee_msat").nullable().alter();
    table.boolean("success").nullable().alter();
    table.string("external_id").nullable();
    table.string("preimage").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("transaction", function (table) {
    table.text("payment_hash").notNullable().alter();
    table.integer("fee_msat").notNullable().alter();
    table.boolean("success").notNullable().alter();
    table.dropColumn("external_id");
    table.dropColumn("preimage");
  });
};
