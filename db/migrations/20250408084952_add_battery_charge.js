exports.up = function (knex) {
  return knex.schema.createTable("battery_deposit", function (table) {
    table.increments("id").primary().unique();
    table.string("payment_request", 700).notNullable();
    table.string("payment_hash").notNullable();
    table.bigInteger("msat_amount").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.string("status");
    table.string("description", 500);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("battery_deposit");
};
