exports.up = function (knex) {
  return knex.schema.alterTable("transaction", function (table) {
    table.boolean("is_lnurl").defaultTo(false);
    table.text("lnurl_comment", 400);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("transaction", function (table) {
    table.dropColumn("is_lnurl");
    table.dropColumn("lnurl_comment");
  });
};
