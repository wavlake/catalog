exports.up = function (knex) {
  return knex.schema.alterTable("promo_reward", function (table) {
    table.text("ip");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("promo_reward", function (table) {
    table.dropColumn("ip");
  });
};
