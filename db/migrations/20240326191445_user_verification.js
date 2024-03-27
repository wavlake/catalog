exports.up = function (knex) {
  return knex.schema.createTable("user_verification", function (table) {
    table.text("user_id").primary().unique();
    table.text("first_name").notNullable();
    table.text("last_name").notNullable();
    table.text("ip").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("user_verification");
};
