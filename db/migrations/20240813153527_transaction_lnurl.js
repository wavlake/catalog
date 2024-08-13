exports.up = function (knex) {
  return knex.schema.alterTable("transaction", function (table) {
    table.boolean("is_lnurl").defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("transaction", function (table) {
    table.dropColumn("is_lnurl");
  });
};
