exports.up = function (knex) {
  return knex.schema.alterTable("user", function (table) {
    table.string("profile_url").unique().index("idx_profile_url");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("user", function (table) {
    table.dropColumn("profile_url");
  });
};
