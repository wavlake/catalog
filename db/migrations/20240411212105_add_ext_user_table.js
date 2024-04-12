exports.up = function (knex) {
  return knex.schema.createTable("external_user", function (table) {
    table.string("external_id").notNullable().primary().unique();
    table.string("firebase_uid", 64);
    table.string("provider", 128);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("external_user");
};
