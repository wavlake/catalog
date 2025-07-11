/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    -- Step 1: Create archive table for duplicate records
    CREATE TABLE forward_detail_duplicates_archive AS 
    SELECT fd.*, 
           now() as archived_at,
           'duplicate_cleanup_2025_07_11' as archive_reason
    FROM forward_detail fd
    WHERE fd.id NOT IN (
      SELECT MIN(id) 
      FROM forward_detail 
      WHERE external_payment_id IS NOT NULL
      GROUP BY external_payment_id
    )
    AND fd.external_payment_id IS NOT NULL;
    
    -- Step 2: Remove duplicates from main table, keeping earliest record
    DELETE FROM forward_detail 
    WHERE id NOT IN (
      SELECT MIN(id) 
      FROM forward_detail 
      WHERE external_payment_id IS NOT NULL
      GROUP BY external_payment_id
    )
    AND external_payment_id IS NOT NULL;
    
    -- Step 3: Add unique constraint
    ALTER TABLE forward_detail 
    ADD CONSTRAINT forward_detail_external_payment_id_unique 
    UNIQUE (external_payment_id);
    
    -- Step 4: Add comment for future reference
    COMMENT ON TABLE forward_detail_duplicates_archive IS 
    'Archive of duplicate forward_detail records removed during bug fix on 2025-07-11. Contains records that were causing accounting discrepancies due to multiple payment callbacks for same external_payment_id.';
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.raw(`
    -- Restore archived duplicates back to main table
    INSERT INTO forward_detail 
    SELECT id, external_payment_id, msat_amount, fee_msat, preimage, success, error, created_at
    FROM forward_detail_duplicates_archive;
    
    -- Drop the unique constraint
    ALTER TABLE forward_detail 
    DROP CONSTRAINT forward_detail_external_payment_id_unique;
    
    -- Drop the archive table
    DROP TABLE forward_detail_duplicates_archive;
  `);
};
