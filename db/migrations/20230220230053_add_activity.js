exports.up = function (knex) {
  return knex.schema
    .createTable("activity", function (table) {
      table.increments("id").primary().unique();
      table.string("user_id", 64).notNullable().index("idx_activity_user_id");
      table.integer("type").notNullable();
      table.integer("type_key").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })
    .alterTable("user", function (table) {
      table.timestamp("last_activity_check_at").defaultTo(knex.fn.now());
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("activity")
    .table("user", function (table) {
      table.dropColumn("last_activity_check_at");
    });
};
