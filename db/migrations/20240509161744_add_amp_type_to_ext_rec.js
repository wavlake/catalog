exports.up = function (knex) {
  return knex.schema.alterTable("external_receive", function (table) {
    table.smallint("payment_type_code");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("external_receive", function (table) {
    table.dropColumn("payment_type_code");
  });
};
