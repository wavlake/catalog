exports.up = function (knex) {
  return knex.schema.alterTable("split", function (table) {
    table.uuid("content_id").notNullable().unique().alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("split", function (table) {
    table.uuid("content_id").notNullable().index("idx_split_content_id");
  });
};
