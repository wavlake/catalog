/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable("forward_detail", function (table) {
    // Add unique constraint on external_payment_id to prevent duplicate records
    table.unique(
      ["external_payment_id"],
      "forward_detail_external_payment_id_unique",
    );
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable("forward_detail", function (table) {
    // Drop the unique constraint
    table.dropUnique(
      ["external_payment_id"],
      "forward_detail_external_payment_id_unique",
    );
  });
};
