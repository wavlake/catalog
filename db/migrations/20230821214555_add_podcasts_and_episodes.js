exports.up = function (knex) {
  return knex.schema
    .createTable("podcast", function (table) {
      table.uuid("id").primary().unique();
      table.string("user_id").notNullable().index("idx_podcast_user_id");
      table.foreign("user_id").references("user.id");
      table.string("name").notNullable();
      table.string("artwork_url");
      table
        .string("podcast_url")
        .notNullable()
        .unique()
        .index("idx_podcast_url");
      table.string("description", 1000);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.timestamp("published_at").defaultTo(knex.fn.now());
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
      table.string("description", 1000);
      table.uuid("podcast_id").notNullable().index("idx_episode_podcast_id");
      table.foreign("podcast_id").references("podcast.id");
      table.integer("order").unsigned().notNullable();
      table.integer("play_count").unsigned().defaultTo(0);
      table.bigInteger("msat_total").unsigned().defaultTo(0);
      table.string("live_url").notNullable();
      table.string("raw_url", 128);
      table.integer("size").unsigned();
      table.integer("duration").unsigned();
      table.boolean("deleted").defaultTo(false);
      table.boolean("is_draft").defaultTo(true);
      table.boolean("is_processing").defaultTo(false);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.timestamp("published_at").defaultTo(knex.fn.now());
    })
    .alterTable("album", function (table) {
      table.boolean("is_draft").defaultTo(false);
      table.timestamp("published_at").defaultTo(knex.fn.now());
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("episode")
    .dropTableIfExists("podcast")
    .alterTable("album", function (table) {
      table.dropColumn("is_draft");
      table.dropColumn("published_at");
    });
};
