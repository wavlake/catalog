exports.up = function (knex) {
  return knex.schema.createTable("transaction", function (table) {
    table.increments("id").primary().unique();
    table.string("user_id").notNullable().index("idx_transaction_user_id");
    table.bigInteger("pre_tx_balance").notNullable();
    table.string("payment_request", 700).notNullable();
    table.string("payment_hash").notNullable();
    table.integer("fee_msat").notNullable();
    table.bigInteger("msat_amount").notNullable();
    table.boolean("withdraw").notNullable();
    table.boolean("success").notNullable();
    table.string("failure_reason");
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("transaction");
};
