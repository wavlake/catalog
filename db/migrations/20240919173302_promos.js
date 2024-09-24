exports.up = function (knex) {
  return knex.schema
    .createTable("promo", function (table) {
      table.increments("id").primary().unique();
      table.uuid("content_id").notNullable().index("idx_promo_content_id");
      table
        .string("content_type", 16)
        .notNullable()
        .index("idx_promo_content_type");
      table.text("external_transaction_id").notNullable();
      table.text("payment_request").notNullable();
      table.integer("msat_budget").notNullable();
      table.check("msat_budget > 0", [], "promo_budget_check");
      table.integer("msat_payout_amount").notNullable();
      table.check("msat_payout_amount > 0", [], "promo_payout_check");
      table.boolean("is_active").notNullable().defaultTo(false);
      table.boolean("is_paid").notNullable().defaultTo(false);
      table.boolean("is_pending").notNullable().defaultTo(true);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    })
    .createTable("promo_reward", function (table) {
      table.increments("id").primary().unique();
      table
        .string("user_id", 64)
        .notNullable()
        .index("idx_promo_reward_user_id");
      table
        .integer("promo_id")
        .notNullable()
        .index("idx_promo_reward_promo_id");
      table.integer("msat_amount").notNullable();
      table.check("msat_amount > 0", [], "promo_reward_amount_check");
      table.boolean("is_pending").notNullable().defaultTo(true);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("promo")
    .dropTableIfExists("promo_reward");
};
