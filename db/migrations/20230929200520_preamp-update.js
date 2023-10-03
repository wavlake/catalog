exports.up = function (knex) {
  return knex.schema.alterTable("preamp", function (table) {
    table.text("user_id").notNullable();
    table.uuid("content_id").notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("preamp", function (table) {
    table.dropColumn("user_id");
    table.dropColumn("content_id");
  });
};
