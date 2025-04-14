exports.up = function (knex) {
  return knex.schema.alterTable("invite_emails", function (table) {
    table.string("user_id").index("idx_invite_user_id");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("invite_emails", function (table) {
    table.dropColumn("user_id");
  });
};
