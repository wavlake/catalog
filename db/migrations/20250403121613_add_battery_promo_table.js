exports.up = function (knex) {
  return knex.schema.createTable("battery_reward", function (table) {
    table.increments("id").primary().unique();
    table
      .string("user_id", 64)
      .notNullable()
      .index("idx_battery_reward_user_id");
    table.integer("msat_amount").notNullable();
    table.integer("fee").notNullable();
    table.check("fee >= 0", [], "battery_reward_fee_check");
    table.check("msat_amount > 0", [], "battery_reward_amount_check");
    table.boolean("is_pending").notNullable().defaultTo(true);
    table.string("status");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.text("ip");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("battery_reward");
};
