/**
 * Migration to create invite list tables
 */
exports.up = function (knex) {
  return (
    knex.schema
      // Create the invite_lists table
      .createTable("invite_lists", function (table) {
        table.increments("id").primary();
        table.string("list_name", 100).notNullable().unique();
        table.timestamp("created_at").defaultTo(knex.fn.now());
      })

      // Create the invite_emails table with foreign key relationship
      .createTable("invite_emails", function (table) {
        table.increments("id").primary();
        table
          .integer("list_id")
          .unsigned()
          .notNullable()
          .references("id")
          .inTable("invite_lists")
          .onDelete("CASCADE");
        table.string("email", 255).notNullable();
        table.timestamp("added_at").defaultTo(knex.fn.now());

        // Add a unique constraint to prevent duplicate emails within the same list
        table.unique(["list_id", "email"]);

        // Create index on email for faster lookups
        table.index("email", "idx_invite_emails_email");
      })
  );
};

/**
 * Rollback migration - drop tables in reverse order
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("invite_emails")
    .dropTableIfExists("invite_lists");
};
