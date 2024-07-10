exports.up = function (knex) {
  return knex.schema.alterTable("comment", function (table) {
    table.string("event_id");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("comment", function (table) {
    table.dropColumn("event_id");
  });
};
