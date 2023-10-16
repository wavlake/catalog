exports.up = function (knex) {
  return knex.schema.createTable("external_payment", function (table) {
    table.increments("id").primary();
    table.text("user_id").notNullable();
    table.foreign("user_id").references("user.id");
    table.integer("payment_index").notNullable();
    table.integer("msat_amount").notNullable();
    table.integer("fee_msat").notNullable();
    table.text("pubkey").notNullable();
    table.text("message");
    table.text("podcast");
    table.uuid("guid");
    table.integer("feed_id"); // per podcastindex spec: https://podcastindex-org.github.io/docs-api/#get-/podcasts/byfeedid
    table.text("episode");
    table.uuid("episode_guid");
    table.integer("ts");
    table.boolean("is_settled").notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("external_payment");
};
