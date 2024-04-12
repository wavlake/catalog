exports.up = function (knex) {
  return knex.schema.createTable("external_user", function (table) {
    table.uuid("firebase_uid").primary().unique();
    table.uuid("external_id").notNullable();
    table.string("provider", 128);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("external_user");
};
