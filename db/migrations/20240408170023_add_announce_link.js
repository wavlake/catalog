exports.up = function (knex) {
  return knex.schema.alterTable("announcement", function (table) {
    table.text("link").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table("announcement", function (table) {
    table.dropColumn("link");
  });
};
