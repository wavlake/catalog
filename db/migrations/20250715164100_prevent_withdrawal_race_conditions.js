/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    -- Step 1: Validate system state before applying constraints
    DO $$
    BEGIN
      -- Check for existing negative balances
      IF EXISTS (SELECT 1 FROM "user" WHERE msat_balance < 0) THEN
        RAISE NOTICE 'Warning: Existing negative balances found. Migration will continue but should be investigated.';
      END IF;
      
      -- Log duplicate transaction count for monitoring
      DECLARE
        duplicate_count INTEGER;
      BEGIN
        SELECT COUNT(*) INTO duplicate_count
        FROM "transaction" t
        WHERE t.id NOT IN (
          SELECT MIN(id) FROM "transaction" 
          WHERE withdraw = true AND is_pending = true
          GROUP BY user_id
        )
        AND t.withdraw = true AND t.is_pending = true;
        
        IF duplicate_count > 0 THEN
          RAISE NOTICE 'Found % duplicate pending withdrawal transactions to clean up', duplicate_count;
        END IF;
      END;
    END
    $$;
    
    -- Step 2: Create archive table structure first
    CREATE TABLE IF NOT EXISTS transaction_race_condition_archive (
      LIKE "transaction" INCLUDING ALL,
      archived_at TIMESTAMP WITH TIME ZONE NOT NULL,
      archive_reason TEXT NOT NULL,
      violation_type TEXT NOT NULL
    );
    
    -- Step 3: Combined archive and cleanup operation for performance
    WITH duplicate_transactions AS (
      SELECT t.* 
      FROM "transaction" t
      WHERE t.id NOT IN (
        SELECT MIN(id) FROM "transaction" 
        WHERE withdraw = true AND is_pending = true
        GROUP BY user_id
      )
      AND t.withdraw = true AND t.is_pending = true
    ),
    archived_transactions AS (
      -- Archive duplicate transactions with metadata
      INSERT INTO transaction_race_condition_archive (
        SELECT 
          t.*,
          now() as archived_at,
          'race_condition_cleanup_2025_07_15' as archive_reason,
          'duplicate_pending_withdrawal' as violation_type
        FROM duplicate_transactions t
      )
      RETURNING user_id, id
    )
    -- Mark duplicate transactions as failed in single operation
    UPDATE "transaction" 
    SET 
      is_pending = false, 
      success = false, 
      failure_reason = 'Cancelled during race condition cleanup - duplicate pending transaction',
      updated_at = now()
    WHERE id IN (SELECT id FROM archived_transactions);
    
    -- Step 4: Unlock users who had multiple pending transactions
    UPDATE "user" 
    SET 
      is_locked = false, 
      updated_at = now()
    WHERE id IN (
      SELECT DISTINCT user_id 
      FROM transaction_race_condition_archive
      WHERE archive_reason = 'race_condition_cleanup_2025_07_15'
    );
    
    -- Step 5: Create unique partial index to prevent future race conditions
    CREATE UNIQUE INDEX unique_pending_withdrawal_per_user 
    ON "transaction" (user_id) 
    WHERE withdraw = true AND is_pending = true;
    
    -- Step 6: Add monitoring view for ongoing race condition detection
    CREATE VIEW transaction_race_condition_monitor AS
    SELECT 
      user_id,
      COUNT(*) as pending_withdrawal_count,
      array_agg(id ORDER BY created_at) as transaction_ids,
      MIN(created_at) as first_pending,
      MAX(created_at) as last_pending
    FROM "transaction" 
    WHERE withdraw = true AND is_pending = true
    GROUP BY user_id
    HAVING COUNT(*) > 1;
    
    -- Step 7: Add aggressive security monitoring views
    CREATE VIEW withdrawal_security_monitor AS
    SELECT 
      user_id,
      COUNT(*) as attempts_last_hour,
      COUNT(*) FILTER (WHERE success = false) as failed_attempts,
      COUNT(*) FILTER (WHERE success = true) as successful_attempts,
      SUM(msat_amount) FILTER (WHERE success = true) as total_withdrawn_msats,
      MIN(created_at) as first_attempt,
      MAX(created_at) as last_attempt
    FROM "transaction" 
    WHERE withdraw = true 
      AND created_at >= NOW() - INTERVAL '1 hour'
    GROUP BY user_id
    HAVING COUNT(*) > 1 OR COUNT(*) FILTER (WHERE success = false) >= 3;
    
    -- Step 8: Add daily withdrawal tracking view
    CREATE VIEW daily_withdrawal_tracking AS
    SELECT 
      user_id,
      DATE(created_at) as withdrawal_date,
      COUNT(*) as daily_withdrawal_count,
      SUM(msat_amount) FILTER (WHERE success = true) as daily_total_msats,
      COUNT(*) FILTER (WHERE success = false) as daily_failures
    FROM "transaction" 
    WHERE withdraw = true 
      AND created_at >= NOW() - INTERVAL '7 days'
    GROUP BY user_id, DATE(created_at)
    ORDER BY withdrawal_date DESC;
    
    -- Step 9: Add helpful comments and documentation
    COMMENT ON INDEX unique_pending_withdrawal_per_user IS 
    'Prevents race conditions by ensuring only one pending withdrawal transaction per user. Added during wallet overdraw vulnerability fix on 2025-07-15. This constraint is enforced at the database level as a safety net, with primary prevention handled in application logic.';
    
    COMMENT ON TABLE transaction_race_condition_archive IS 
    'Archive of duplicate pending withdrawal transactions found during race condition fix on 2025-07-15. These transactions were causing the exact vulnerability we discovered in the wallet overdraw incident.';
    
    COMMENT ON VIEW transaction_race_condition_monitor IS 
    'Monitoring view to detect any future race conditions in withdrawal transactions. Should always return 0 rows after migration.';
    
    COMMENT ON VIEW withdrawal_security_monitor IS 
    'Aggressive security monitoring view to detect suspicious withdrawal patterns: rapid attempts, high failure rates, and potential abuse. Used for real-time fraud detection.';
    
    COMMENT ON VIEW daily_withdrawal_tracking IS 
    'Daily withdrawal tracking view for monitoring user withdrawal patterns and enforcing daily limits. Tracks successful withdrawals, failures, and total amounts over the past 7 days.';
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.raw(`
    -- Step 1: Safety validation before rollback
    DO $$
    BEGIN
      -- Check if we have archived transactions to restore
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction_race_condition_archive') THEN
        DECLARE 
          archive_count INTEGER;
        BEGIN
          SELECT COUNT(*) INTO archive_count FROM transaction_race_condition_archive;
          IF archive_count > 0 THEN
            RAISE NOTICE 'Rolling back migration will restore % archived transactions', archive_count;
          END IF;
        END;
      END IF;
    END
    $$;
    
    -- Step 2: Drop the monitoring views
    DROP VIEW IF EXISTS daily_withdrawal_tracking;
    DROP VIEW IF EXISTS withdrawal_security_monitor;
    DROP VIEW IF EXISTS transaction_race_condition_monitor;
    
    -- Step 3: Drop the unique index constraint
    DROP INDEX IF EXISTS unique_pending_withdrawal_per_user;
    
    -- Step 4: Restore archived transactions (DANGEROUS - only for testing)
    -- WARNING: This restores the race condition vulnerability
    UPDATE "transaction" 
    SET 
      is_pending = true, 
      success = NULL, 
      failure_reason = NULL,
      updated_at = now()
    WHERE id IN (
      SELECT id FROM transaction_race_condition_archive
      WHERE archive_reason = 'race_condition_cleanup_2025_07_15'
    );
    
    -- Step 5: Clean up archive table
    DELETE FROM transaction_race_condition_archive 
    WHERE archive_reason = 'race_condition_cleanup_2025_07_15';
    
    -- Step 6: Drop archive table if empty
    DO $$
    BEGIN
      IF (SELECT COUNT(*) FROM transaction_race_condition_archive) = 0 THEN
        DROP TABLE transaction_race_condition_archive;
      END IF;
    END
    $$;
    
    -- Step 7: Warning about rollback implications
    DO $$
    BEGIN
      RAISE WARNING 'SECURITY WARNING: Migration rollback complete. The wallet overdraw vulnerability has been RESTORED. This should only be done in development environments.';
    END
    $$;
  `);
};
