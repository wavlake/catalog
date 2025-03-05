exports.up = function (knex) {
  return knex.schema.alterTable("ticketed_event", function (table) {
    table.decimal("price_fiat", 10, 2).nullable();
    table.string("currency", 3).nullable();
    table.raw(
      "ALTER TABLE ticketed_event ADD CONSTRAINT chk_currency_required CHECK ((price_fiat IS NULL AND currency IS NULL) OR (price_fiat IS NOT NULL AND currency IS NOT NULL))"
    );
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("ticketed_event", function (table) {
    table.dropColumn("price_fiat");
    table.dropColumn("currency");
  });
};
