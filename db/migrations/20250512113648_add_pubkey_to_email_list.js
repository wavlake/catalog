/**
 * Migration to add pubkey column to invite_emails table
 */
exports.up = function (knex) {
  return knex.schema.alterTable("invite_emails", function (table) {
    // Add pubkey column
    table.string("pubkey", 64).index("idx_invite_emails_pubkey");

    // Update email column to be nullable
    table.string("email", 255).nullable().alter();
  }).raw(`
      -- Add check constraint to ensure either pubkey or email is not null
      ALTER TABLE invite_emails ADD CONSTRAINT chk_invite_emails_email_or_pubkey 
      CHECK (email IS NOT NULL OR pubkey IS NOT NULL);
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
      ALTER TABLE invite_emails DROP CONSTRAINT chk_invite_emails_email_or_pubkey;
    `
    )
    .alterTable("invite_emails", function (table) {
      // Make email required again
      table.string("email", 255).notNullable().alter();

      // Drop pubkey column
      table.dropColumn("pubkey");
    });
};
