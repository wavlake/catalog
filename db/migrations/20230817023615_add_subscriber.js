exports.up = function (knex) {
  return knex.schema.createTable("subscriber", function (table) {
    table.string("user_id", 64).primary().unique();
    table.foreign("user_id").references("user.id");
    table.string("provider").notNullable();
    table.string("provider_user_id").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("subscriber");
};
