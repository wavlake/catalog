exports.up = function (knex) {
  return knex.schema.alterTable("time_split", function (table) {
    table.uuid("recipient_content_id").notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("time_split", function (table) {
    table.dropColumn("recipient_content_id");
  });
};
