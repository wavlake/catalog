exports.up = function (knex) {
  return knex.schema
    .alterTable("amp", function (table) {
      table.dropColumn("value_guid");
      table.dropColumn("value_podcast");
      table.dropColumn("value_feed_id");
      table.dropColumn("value_episode");
      table.dropColumn("value_item_id");
      table.dropColumn("value_ts");
      table.dropColumn("value_app_name");
      table.dropColumn("value_sender_name");
    })
    .createTable("preamp", function (table) {
      table.uuid("tx_id").primary();
      table.integer("msat_amount").notNullable();
      table.check("msat_amount >= 1", [], "preamp_msat_amount_check");
      table.text("guid");
      table.text("podcast");
      table.integer("feed_id");
      table.text("episode");
      table.integer("item_id");
      table.integer("ts");
      table.text("app_name");
      table.text("sender_name");
    });
};

exports.down = function (knex) {
  return knex.schema.dropTable("preamp").alterTable("amp", function (table) {
    table.text("value_guid");
    table.text("value_podcast");
    table.integer("value_feed_id");
    table.text("value_episode");
    table.integer("value_item_id");
    table.integer("value_ts");
    table.text("value_app_name");
    table.text("value_sender_name");
  });
};
