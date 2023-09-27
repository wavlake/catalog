exports.up = function (knex) {
  return knex.schema
    .alterTable("amp", function (table) {
      table.renameColumn("split_tx", "tx_id");
    })
    .alterTable("comment", function (table) {
      table.uuid("tx_id").defaultTo(null);
      table.uuid("content_id").defaultTo(null).index("idx_comment_content_id");
      table.string("content_type", 12).defaultTo("track");
      table.boolean("is_nostr").defaultTo(false);
      table.text("content").alter();
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable("amp", function (table) {
      table.renameColumn("tx_id", "split_tx");
    })
    .alterTable("comment", function (table) {
      table.dropColumn("tx_id");
      table.dropColumn("content_id");
      table.dropColumn("content_type");
      table.dropColumn("is_nostr");
    });
};
