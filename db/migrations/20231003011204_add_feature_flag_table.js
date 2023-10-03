exports.up = function (knex) {
  return knex.schema
    .createTable("feature_flag", function (table) {
      table.increments("id").primary().unique();
      table.string("name").notNullable();
    })
    .createTable("user_flag", function (table) {
      table.increments("id").primary().unique();
      table.string("user_id").notNullable().index("idx_user_flag_id");
      table.foreign("user_id").references("user.id");
      table
        .integer("feature_flag_id")
        .notNullable()
        .index("idx_user_feature_flag_id");
      table.foreign("feature_flag_id").references("feature_flag.id");
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("user_flag")
    .dropTableIfExists("feature_flag");
};
