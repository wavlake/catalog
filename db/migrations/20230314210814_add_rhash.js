exports.up = function (knex) {
  return knex.schema.alterTable("external_receive", function (table) {
    table.string("payment_hash");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("external_receive", function (table) {
    table.dropColumn("payment_hash");
  });
};
