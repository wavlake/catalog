exports.up = function (knex) {
  return knex.schema.createTable("announcement", function (table) {
    table.increments("id").primary();
    table.text("title").notNullable();
    table.text("content").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("announcement");
};
