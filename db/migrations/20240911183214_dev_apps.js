exports.up = function (knex) {
  return knex.schema
    .createTable("referrer_app", function (table) {
      table.string("id", 21).primary().unique(); // should be human-readable
      table.text("name").notNullable();
      table.string("user_id", 64).notNullable().index("idx_app_user_id");
      table.foreign("user_id").references("user.id"); // user_id must exist in user table
      table.smallint("share").notNullable().defaultTo(0).checkBetween([0, 100]); // value must be between 0 and 100
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })
    .alterTable("external_receive", function (table) {
      table.string("referrer_app_id", 21);
    });
};

exports.down = function (knex) {
  return knex.schema.dropTable("referrer_app");
};
