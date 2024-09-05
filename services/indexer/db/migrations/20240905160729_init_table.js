exports.up = function (knex) {
  return knex.schema.createTable("run_log", function (table) {
    table.increments("id").primary();
    table.integer("updated_at");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("run_log");
};
