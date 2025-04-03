exports.up = function (knex) {
  return knex.schema.createTable("battery_balance", function (table) {
    table.increments("id").primary().unique();
    table.integer("msat_balance").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("battery_balance");
};
