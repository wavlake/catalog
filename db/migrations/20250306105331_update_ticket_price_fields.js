exports.up = function (knex) {
  return knex.schema
    .alterTable("ticketed_event", function (table) {
      // Make price_msat nullable
      table.integer("price_msat").nullable().alter();
    })
    .then(() => {
      return knex.raw(`
      ALTER TABLE ticketed_event 
      ADD CONSTRAINT chk_price_required 
      CHECK (
        (price_msat IS NOT NULL AND price_fiat IS NULL AND currency IS NULL) OR 
        (price_msat IS NULL AND price_fiat IS NOT NULL AND currency IS NOT NULL)
      )
    `);
    });
};

exports.down = function (knex) {
  return knex
    .raw("ALTER TABLE ticketed_event DROP CONSTRAINT chk_price_required")
    .then(() => {
      return knex.schema.alterTable("ticketed_event", function (table) {
        // Revert price_msat to non-nullable
        table.integer("price_msat").notNullable().alter();
      });
    });
};
