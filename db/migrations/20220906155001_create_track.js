exports.up = function (knex) {
  return knex.schema
    .createTable("track", function (table) {
      table.uuid("id").primary().unique();
      table.uuid("artist_id").notNullable().index("idx_track_artist_id");
      table.uuid("album_id").notNullable().index("idx_track_album_id");
      table.string("title").notNullable();
      table.integer("order").unsigned().notNullable();
      table.integer("play_count").unsigned().defaultTo(0);
      table.bigInteger("msat_total").unsigned().defaultTo(0);
      table.string("live_url").notNullable();
      table.string("raw_url", 128);
      table.integer("size").unsigned();
      table.integer("duration").unsigned();
      table.boolean("deleted").defaultTo(false);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    })

    .createTable("user", function (table) {
      table.string("id", 64).primary().unique();
      table.string("name").unique().notNullable();
      table.bigInteger("msat_balance").unsigned().defaultTo(0);
      table.integer("amp_msat").unsigned().defaultTo(1000);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    })

    .createTable("artist", function (table) {
      table.uuid("id").primary().unique();
      table.string("user_id").notNullable().index("idx_artist_user_id");
      table.string("name").notNullable();
      table.string("avatar_url");
      table.string("artist_url").notNullable().unique().index("idx_artist_url");
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    })

    .createTable("album", function (table) {
      table.uuid("id").primary().unique();
      table.uuid("artist_id").notNullable().index("idx_album_artist_id");
      table.string("title").notNullable();
      table.string("artwork_url");
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    })

    .createTable("amp", function (table) {
      table.increments("id").primary().unique();
      table.uuid("track_id").notNullable().index("idx_amp_track_id");
      table.string("user_id").notNullable().index("idx_amp_user_id");
      table.integer("msat_amount").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })

    .createTable("play", function (table) {
      table.increments("id").primary().unique();
      table.uuid("track_id").notNullable().index("idx_play_track_id");
      table.string("user_id").notNullable().index("idx_play_user_id");
      table.boolean("complete").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })

    .createTable("amp_ext", function (table) {
      table.integer("settle_index").notNullable().unique();
      table.string("preimage").notNullable();
      table.uuid("track_id").notNullable().index("idx_amp_ext_track_id");
      table.integer("msat_amount").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("track")
    .dropTableIfExists("user")
    .dropTableIfExists("artist")
    .dropTableIfExists("album")
    .dropTableIfExists("amp")
    .dropTableIfExists("amp_ext")
    .dropTableIfExists("play");
};
