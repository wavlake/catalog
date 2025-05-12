/**
 * Migration to add unique constraint on list_id and pubkey in invite_emails table
 */
exports.up = function (knex) {
  return knex.schema.alterTable("invite_emails", function (table) {
    // Add unique constraint on list_id and pubkey combination
    table.unique(["list_id", "pubkey"], "invite_emails_list_id_pubkey_unique");
  });
};

/**
 * Rollback migration
 */
exports.down = function (knex) {
  return knex.schema.alterTable("invite_emails", function (table) {
    // Drop the unique constraint
    table.dropUnique(
      ["list_id", "pubkey"],
      "invite_emails_list_id_pubkey_unique"
    );
  });
};
