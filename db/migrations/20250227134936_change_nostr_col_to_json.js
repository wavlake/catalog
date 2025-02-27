exports.up = function (knex) {
  return knex.schema.alterTable("ticket", function (table) {
    table.jsonb("nostr").nullable().alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("ticket", function (table) {
    table.string("nostr").notNullable().alter();
  });
};
