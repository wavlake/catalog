exports.up = function (knex) {
  return knex.schema.table("album", function (table) {
    table.jsonb("color_info").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table("album", function (table) {
    table.dropColumn("color_info");
  });
};
