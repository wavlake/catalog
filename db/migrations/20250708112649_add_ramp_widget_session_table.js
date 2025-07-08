/**
 * Migration to add ramp_widget_session table for ZBD Pay ramp widget integration
 */
exports.up = function (knex) {
  return knex.schema.createTable("ramp_widget_session", function (table) {
    table.string("id", 255).primary().unique();
    table
      .string("user_id", 64)
      .notNullable()
      .index("idx_ramp_widget_session_user_id");
    table.string("email", 255).notNullable();
    table.double("amount").nullable();
    table.string("currency", 10).nullable();
    table
      .string("reference_id", 255)
      .unique()
      .notNullable()
      .index("idx_ramp_widget_session_reference_id");
    table.string("session_token", 255).notNullable();
    table.text("widget_url").notNullable();
    table
      .string("status", 50)
      .notNullable()
      .defaultTo("pending")
      .index("idx_ramp_widget_session_status");
    table.timestamp("expires_at").notNullable();
    table.json("callback_data").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    // Foreign key constraint
    table
      .foreign("user_id")
      .references("id")
      .inTable("user")
      .onDelete("NO ACTION")
      .onUpdate("NO ACTION");
  });
};

/**
 * Rollback migration
 */
exports.down = function (knex) {
  return knex.schema.dropTable("ramp_widget_session");
};
