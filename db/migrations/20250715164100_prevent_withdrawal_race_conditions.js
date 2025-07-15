/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    -- Step 1: Create archive table for problematic pending transactions
    CREATE TABLE transaction_race_condition_archive AS 
    SELECT t.*, 
           now() as archived_at,
           'race_condition_cleanup_2025_07_15' as archive_reason
    FROM "transaction" t
    WHERE t.id NOT IN (
      SELECT MIN(id) 
      FROM "transaction" 
      WHERE withdraw = true AND is_pending = true
      GROUP BY user_id
    )
    AND t.withdraw = true 
    AND t.is_pending = true;
    
    -- Step 2: Mark duplicate pending transactions as failed to resolve constraint violation
    UPDATE "transaction" 
    SET is_pending = false, 
        success = false, 
        failure_reason = 'Cancelled during race condition cleanup - duplicate pending transaction',
        updated_at = now()
    WHERE id NOT IN (
      SELECT MIN(id) 
      FROM "transaction" 
      WHERE withdraw = true AND is_pending = true
      GROUP BY user_id
    )
    AND withdraw = true 
    AND is_pending = true;
    
    -- Step 3: Unlock users who had multiple pending transactions
    UPDATE "user" 
    SET is_locked = false, 
        updated_at = now()
    WHERE id IN (
      SELECT DISTINCT user_id 
      FROM transaction_race_condition_archive
    );
    
    -- Step 4: Create unique partial index to prevent multiple pending withdrawal transactions per user
    CREATE UNIQUE INDEX unique_pending_withdrawal_per_user 
    ON "transaction" (user_id) 
    WHERE withdraw = true AND is_pending = true;
    
    -- Step 5: Add function to prevent negative balances
    CREATE OR REPLACE FUNCTION check_negative_balance()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.msat_balance < 0 THEN
        RAISE EXCEPTION 'Negative balance detected for user %: % msats', 
                       NEW.id, NEW.msat_balance;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Step 6: Create trigger to prevent negative balances
    DROP TRIGGER IF EXISTS prevent_negative_balance ON "user";
    CREATE TRIGGER prevent_negative_balance
      BEFORE UPDATE ON "user"
      FOR EACH ROW
      EXECUTE FUNCTION check_negative_balance();
    
    -- Step 7: Add comments for future reference
    COMMENT ON INDEX unique_pending_withdrawal_per_user IS 
    'Prevents race conditions by ensuring only one pending withdrawal transaction per user. Added during wallet overdraw vulnerability fix on 2025-07-15.';
    
    COMMENT ON FUNCTION check_negative_balance() IS 
    'Prevents negative user balances by raising exception during UPDATE operations. Added during wallet overdraw vulnerability fix on 2025-07-15.';
    
    COMMENT ON TABLE transaction_race_condition_archive IS 
    'Archive of duplicate pending withdrawal transactions found during race condition fix on 2025-07-15. These transactions were causing the exact vulnerability we discovered.';
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.raw(`
    -- Drop the trigger
    DROP TRIGGER IF EXISTS prevent_negative_balance ON "user";
    
    -- Drop the function
    DROP FUNCTION IF EXISTS check_negative_balance();
    
    -- Drop the unique index
    DROP INDEX IF EXISTS unique_pending_withdrawal_per_user;
    
    -- Restore archived transactions (if rollback is needed)
    UPDATE "transaction" 
    SET is_pending = true, 
        success = NULL, 
        failure_reason = NULL,
        updated_at = now()
    WHERE id IN (
      SELECT id FROM transaction_race_condition_archive
    );
    
    -- Drop the archive table
    DROP TABLE IF EXISTS transaction_race_condition_archive;
  `);
};
