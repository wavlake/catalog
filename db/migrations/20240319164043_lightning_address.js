exports.up = function (knex) {
  return knex.schema.table("user", function (table) {
    table.text("lightning_address");
  });
};

exports.down = function (knex) {
  return knex.schema.table("user", function (table) {
    table.dropColumn("lightning_address");
  });
};
