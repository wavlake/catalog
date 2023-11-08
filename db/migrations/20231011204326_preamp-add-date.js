exports.up = function (knex) {
  return knex.schema.alterTable("preamp", function (table) {
    table.timestamp("created_at");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("preamp", function (table) {
    table.dropColumn("created_at");
  });
};
