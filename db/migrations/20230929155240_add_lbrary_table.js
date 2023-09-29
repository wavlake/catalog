exports.up = function (knex) {
  return knex.schema.createTable("library", function (table) {
    table.increments("id").primary().unique();
    table.text("user_id").notNullable().index("idx_library_user_id");
    table.text("content_id").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("library");
};
