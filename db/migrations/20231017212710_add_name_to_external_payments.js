exports.up = function (knex) {
  return knex.schema.alterTable("external_payment", function (table) {
    table.text("name");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("external_payment", function (table) {
    table.dropColumn("name");
  });
};
