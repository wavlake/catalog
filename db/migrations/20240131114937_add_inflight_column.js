exports.up = function (knex) {
  return knex.schema
    .alterTable("external_payment", function (table) {
      table.boolean("in_flight").defaultTo(true);
    })
    .alterTable("transaction", function (table) {
      table.boolean("in_flight").defaultTo(true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("external_payment", function (table) {
      table.dropColumn("in_flight");
    })
    .alterTable("transaction", function (table) {
      table.boolean("in_flight");
    });
};
