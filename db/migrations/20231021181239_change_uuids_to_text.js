exports.up = function (knex) {
  return knex.schema.alterTable("external_payment", function (table) {
    table.text("guid").alter();
    table.text("episode_guid").alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("external_payment", function (table) {
    table.uuid("guid").alter();
    table.uuid("episode_guid").alter();
  });
};
