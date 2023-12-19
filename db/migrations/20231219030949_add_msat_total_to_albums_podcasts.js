exports.up = function (knex) {
  return knex.schema
    .alterTable("podcast", function (table) {
      table.integer("msat_total").defaultTo(0);
    })
    .alterTable("album", function (table) {
      table.integer("msat_total").defaultTo(0);
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("podcast", function (table) {
      table.dropColumn("msat_total");
    })
    .alterTable("album", function (table) {
      table.dropColumn("msat_total");
    });
};
