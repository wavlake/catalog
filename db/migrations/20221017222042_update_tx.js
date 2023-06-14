exports.up = function (knex) {
  return knex.schema
    .alterTable("transaction", function (table) {
      table.boolean("is_pending").notNullable().defaultTo(false);
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    })
    .alterTable("user", function (table) {
      table.boolean("is_locked").notNullable().defaultTo(false);
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("transaction", function (table) {
      table.dropColumn("is_pending");
      table.dropColumn("updated_at");
    })
    .alterTable("user", function (table) {
      table.dropColumn("is_locked");
    });
};
