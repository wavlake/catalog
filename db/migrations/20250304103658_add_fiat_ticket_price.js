exports.up = function (knex) {
  return knex.schema.alterTable("ticketed_event", function (table) {
    table.decimal("price_fiat").nullable();
    table.string("currency", 3).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("ticketed_event", function (table) {
    table.dropColumn("price_fiat");
    table.dropColumn("currency");
  });
};
