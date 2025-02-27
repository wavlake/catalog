exports.up = function (knex) {
  return knex.schema.alterTable("ticket", function (table) {
    table.string("recipient_pubkey", 64).notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("ticket", function (table) {
    table.dropColumn("recipient_pubkey");
  });
};
