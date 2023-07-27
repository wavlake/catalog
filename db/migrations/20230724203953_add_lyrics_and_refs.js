exports.up = function (knex) {
  return knex.schema
    .alterTable("track", function (table) {
      table.text("lyrics");
    })
    .alterTable("play", function (table) {
      table.text("user_agent");
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("track", function (table) {
      table.dropColumn("lyrics");
    })
    .alterTable("play", function (table) {
      table.dropColumn("user_agent");
    });
};
