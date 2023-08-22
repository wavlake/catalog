exports.up = function (knex) {
  return knex.schema
    .createTable("podcast", function (table) {
      table.uuid("id").primary().unique();
      table.string("user_id").notNullable().index("idx_podcast_user_id");
      table.string("name").notNullable();
      table.string("artwork_url");
      table
        .string("podcast_url")
        .notNullable()
        .unique()
        .index("idx_podcast_url");
      table.string("description");
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.boolean("deleted").defaultTo(false);
      table.boolean("is_draft").defaultTo(true);
      table.string("twitter");
      table.string("instagram");
      table.string("youtube");
      table.string("website");
      table.string("npub");
    })
    .createTable("episode", function (table) {
      table.uuid("id").primary().unique();
      table.string("title").notNullable();
      table.string("description");
      table.uuid("podcast_id").notNullable().index("idx_episode_podcast_id");
      table.integer("order").unsigned().notNullable();
      table.integer("play_count").unsigned().defaultTo(0);
      table.bigInteger("msat_total").unsigned().defaultTo(0);
      table.string("live_url").notNullable();
      table.string("raw_url", 128);
      table.integer("size").unsigned();
      table.integer("duration").unsigned();
      table.boolean("deleted").defaultTo(false);
      table.boolean("is_draft").defaultTo(true);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("podcast").dropTableIfExists("episode");
};
