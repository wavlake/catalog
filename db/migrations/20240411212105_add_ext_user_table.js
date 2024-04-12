exports.up = function (knex) {
  return knex.schema.createTable("external_user", function (table) {
    table.string("firebase_uid", 64).primary().unique();
    table.string("external_id").notNullable();
    table.string("provider", 128);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("external_user");
};
