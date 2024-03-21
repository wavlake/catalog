exports.up = function (knex) {
  return knex.schema
    .createTable("forward", function (table) {
      table.increments("id").primary().unique();
      table.text("user_id").notNullable().index("idx_forward_user_id");
      table.text("lightning_address").notNullable();
      table.integer("msat_amount").notNullable();
      table.boolean("in_flight").notNullable().defaultTo(false);
      table.boolean("is_settled").notNullable().defaultTo(false);
      table.text("error").nullable();
      table.text("external_payment_id").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.integer("attempt_count").notNullable().defaultTo(0);
      table.text("remainder_id").nullable();
    })
    .alterTable("user", function (table) {
      table.text("lightning_address");
    });
};

exports.down = function (knex) {
  return knex.schema
    .table("user", function (table) {
      table.dropColumn("lightning_address");
    })
    .dropTable("forward");
};
