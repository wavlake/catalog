/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    -- First, remove duplicate records, keeping only the earliest one for each external_payment_id
    DELETE FROM forward_detail 
    WHERE id NOT IN (
      SELECT MIN(id) 
      FROM forward_detail 
      WHERE external_payment_id IS NOT NULL
      GROUP BY external_payment_id
    )
    AND external_payment_id IS NOT NULL;
    
    -- Then add the unique constraint
    ALTER TABLE forward_detail 
    ADD CONSTRAINT forward_detail_external_payment_id_unique 
    UNIQUE (external_payment_id);
  `);
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
