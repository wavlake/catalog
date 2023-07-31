/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable("track", function (table) {
    table.boolean("is_draft").defaultTo(false);
    table.timestamp("published_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable("track", function (table) {
    table.dropColumn("is_draft");
    table.dropColumn("published_at");
  });
};
