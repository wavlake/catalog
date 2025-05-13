/**
 * Migration to add pubkey column to battery_reward table
 */
exports.up = function (knex) {
  return knex.schema.alterTable("battery_reward", function (table) {
    // Add pubkey column with index
    table.string("pubkey", 64).index("idx_battery_reward_pubkey");

    // Make user_id nullable (changing from notNullable)
    table.string("user_id", 64).nullable().alter();
  }).raw(`
      -- Add check constraint to ensure either pubkey or user_id is not null
      ALTER TABLE battery_reward ADD CONSTRAINT chk_battery_reward_id_required 
      CHECK (user_id IS NOT NULL OR pubkey IS NOT NULL);
    `);
};

/**
 * Rollback migration
 */
exports.down = function (knex) {
  return knex.schema
    .raw(
      `
      -- Remove the check constraint
      ALTER TABLE battery_reward DROP CONSTRAINT chk_battery_reward_id_required;
    `
    )
    .alterTable("battery_reward", function (table) {
      // Make user_id required again
      table.string("user_id", 64).notNullable().alter();

      // Drop pubkey column
      table.dropColumn("pubkey");
    });
};
