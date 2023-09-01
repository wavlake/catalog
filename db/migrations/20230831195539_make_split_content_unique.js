exports.up = function (knex) {
  return knex.schema.alterTable("split", function (table) {
    table.uuid("content_id").notNullable().unique();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("split", function (table) {
    table.dropUnique("content_id");
  });
};
