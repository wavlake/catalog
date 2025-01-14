exports.up = function (knex) {
  return knex.schema.alterTable("user", function (table) {
    table.datetime("last_inbox_read").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("user", function (table) {
    table.dropColumn("last_inbox_read");
  });
};
