exports.up = function (knex) {
  return knex.schema.alterTable("comment", function (table) {
    table.string("zap_event_id");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("comment", function (table) {
    table.dropColumn("zap_event_id");
  });
};
