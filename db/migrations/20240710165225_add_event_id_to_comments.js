exports.up = function (knex) {
  return knex.schema
    .alterTable("comment", function (table) {
      table.string("event_id");
    })
    .alterTable("zap_request", function (table) {
      table.string("event_id", 64).index("idx_zap_request_event_id").alter();
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("comment", function (table) {
      table.dropColumn("event_id");
    })
    .alterTable("zap_request", function (table) {
      table.dropIndex(["event_id"], "idx_zap_request_event_id");
    });
};
