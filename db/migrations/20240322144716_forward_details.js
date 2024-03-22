exports.up = function (knex) {
  return knex.schema.createTable("forward_detail", function (table) {
    table.increments("id").primary().unique();
    table.text("external_payment_id").notNullable();
    table.integer("msat_amount").notNullable();
    table.integer("fee_msat").notNullable();
    table.text("preimage").notNullable();
    table.boolean("success").notNullable().defaultTo(false);
    table.text("error").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("forward_detail");
};
